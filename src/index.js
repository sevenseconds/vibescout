#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Command } from "commander";
import fs from "fs-extra";
import { logger, LogLevel } from "./logger.js";
import { configureEnvironment, embeddingManager, summarizerManager, rerankerManager } from "./embeddings.js";
import { closeDb, compactDatabase, initDB } from "./db.js";
import { handleIndexFolder, stopIndexing } from "./core.js";
import { server, app } from "./server.js";
import { initWatcher } from "./watcher.js";
import { loadConfig, interactiveConfig } from "./config.js";
import { interactiveSearch } from "./tui.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
import pkg from "enquirer";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function handleShutdown() {
  logger.info("\n[Shutdown] Signal received. Cleaning up...");
  stopIndexing();
  await closeDb();
  logger.info("[Shutdown] Cleanup complete. Goodbye!");
  process.exit(0);
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

async function startServer(mode, port, isUI = false) {
  if (mode === "sse" || mode === "http") {
    const isSSE = mode === "sse";
    logger.info(`Starting MCP ${isSSE ? "SSE" : "HTTP"} Server on port ${port}${isUI ? " (with Web UI)" : ""}...`);
    
    // Standardize on /mcp endpoint
    const transport = new StreamableHTTPServerTransport({ endpoint: "/mcp" });
    await server.connect(transport);

    // MCP Transport handler via Hono (using Node.js adapter raw req/res)
    app.all('/mcp', async (c) => {
      // @ts-ignore - node-server specific
      const nodeReq = c.env.incoming;
      // @ts-ignore - node-server specific
      const nodeRes = c.env.outgoing;
      await transport.handleRequest(nodeReq, nodeRes);
    });

    if (isUI) {
      const distPath = path.resolve(__dirname, "ui-dist");
      if (!fs.existsSync(distPath)) {
        logger.warn(`[UI] Warning: UI assets not found at ${distPath}. Web UI will not be available.`);
        logger.warn(`[UI] If you are developing, run 'npm run build:ui' to generate the assets.`);
      }
      app.use('/*', serveStatic({ root: distPath }));
      // Fallback for SPA
      app.get('*', async (c, next) => {
        const url = new URL(c.req.url);
        if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/mcp')) {
          const indexPath = path.resolve(distPath, "index.html");
          if (await fs.pathExists(indexPath)) {
            const html = await fs.readFile(indexPath, "utf-8");
            return c.html(html);
          }
        }
        return next();
      });
    }

    serve({
      fetch: app.fetch,
      port
    });

    if (isUI || !isSSE) {
      if (isUI) console.log(`\nVibeScout Web UI available at: http://localhost:${port}`);
      console.log(`MCP Endpoint available at: http://localhost:${port}/mcp`);
    }
    return;
  }

  if (mode === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("Local Code Search MCP Server running (stdio)");
  }
}

async function main() {
  const config = await loadConfig();
  const program = new Command();

  program
    .name("vibescout")
    .description("Local Code Search MCP Server")
    .version(pkg.version)
    .option("--models-path <path>", "Path to local models directory", config.modelsPath || process.env.MODELS_PATH)
    .option("--offline", "Force offline mode (disable remote model downloads)", config.offline || process.env.OFFLINE_MODE === "true")
    .option("--mcp [mode]", "MCP transport mode (stdio, sse, http)", "stdio")
    .option("--port <number>", "Port for sse or http mode", config.port || process.env.PORT || 3000)
    .option("--log-level <level>", "Log level (debug, info, warn, error, none)", "info")
    .option("--verbose", "Enable verbose logging (alias for --log-level debug)", config.verbose || false)
    .option("--force", "Force full re-index of all watched projects on startup", false);

  program.hook("preAction", async (thisCommand) => {
    const opts = thisCommand.opts();
    
    let level = LogLevel.INFO;
    if (opts.verbose) {
      level = LogLevel.DEBUG;
    } else {
      switch (opts.logLevel?.toLowerCase()) {
        case 'debug': level = LogLevel.DEBUG; break;
        case 'info': level = LogLevel.INFO; break;
        case 'warn': level = LogLevel.WARN; break;
        case 'error': level = LogLevel.ERROR; break;
        case 'none': level = LogLevel.NONE; break;
      }
    }
    logger.setLevel(level);

    configureEnvironment(opts.modelsPath, opts.offline);

    const providerConfig = {
      type: (config.provider === "lmstudio" ? "openai" : config.provider) || "local",
      modelName: config.embeddingModel || "Xenova/bge-small-en-v1.5",
      baseUrl: config.provider === "ollama" ? config.ollamaUrl :
        (config.provider === "openai" || config.provider === "lmstudio") ? config.openaiBaseUrl : undefined,
      apiKey: config.provider === "gemini" ? config.geminiKey :
        config.provider === "cloudflare" ? config.cloudflareToken :
          (config.provider === "zai" || config.provider === "zai-coding") ? config.zaiKey :
            config.openaiKey,
      accountId: config.cloudflareAccountId,
      awsRegion: config.awsRegion,
      awsProfile: config.awsProfile
    };

    const llmConfig = {
      type: (config.llmProvider === "lmstudio" ? "openai" : config.llmProvider || config.provider) || "local",
      modelName: config.llmModel || config.embeddingModel || "Xenova/distilbart-cnn-6-6",
      baseUrl: (config.llmProvider || config.provider) === "ollama" ? config.ollamaUrl :
        ((config.llmProvider || config.provider) === "openai" || (config.llmProvider || config.provider) === "lmstudio") ? config.openaiBaseUrl : undefined,
      apiKey: (config.llmProvider || config.provider) === "gemini" ? config.geminiKey :
        (config.llmProvider || config.provider) === "cloudflare" ? config.cloudflareToken :
          ((config.llmProvider || config.provider) === "zai" || (config.llmProvider || config.provider) === "zai-coding") ? config.zaiKey :
            config.openaiKey,
      accountId: config.cloudflareAccountId,
      awsRegion: config.awsRegion,
      awsProfile: config.awsProfile
    };

    await embeddingManager.setProvider(providerConfig, config.throttlingErrors);
    await summarizerManager.setProvider(llmConfig, config.throttlingErrors);
    await rerankerManager.setProvider({ useReranker: config.useReranker, offline: opts.offline });

    await initDB({
      type: config.dbProvider || "local",
      accountId: config.cloudflareAccountId,
      apiToken: config.cloudflareToken,
      indexName: config.cloudflareVectorizeIndex
    });

    await initWatcher(!!opts.force);
  });

  program
    .command("config")
    .description("Interactive configuration TUI")
    .action(async () => {
      await interactiveConfig();
    });

  program
    .command("ui")
    .description("Start the Web UI")
    .option("--force", "Force full re-index of all watched projects on startup", false)
    .action(async (options) => {
      const opts = program.opts();
      const force = !!options.force || !!opts.force;
      const port = parseInt(opts.port);
      await startServer("http", port, true);
    });

  program
    .command("compact")
    .description("Remove stale files and optimize database storage")
    .action(async () => {
      console.log("Compacting database and removing stale entries...");
      const result = await compactDatabase();
      console.log(`Compact complete! Pruned ${result.pruned} stale files.`);
      if (result.optimized) console.log("Database storage optimized.");
      await closeDb();
    });

  program
    .command("reset")
    .description("Completely clear the local database and cache")
    .option("--force", "Skip confirmation prompt")
    .action(async (options) => {
      let proceed = !!options.force;
      
      if (!proceed) {
        const prompt = new pkg.Confirm({
          name: 'question',
          message: 'Are you sure you want to clear the entire database? This cannot be undone.'
        });
        proceed = await prompt.run();
      }

      if (proceed) {
        console.log("Clearing database...");
        await clearDatabase();
        console.log("Database cleared successfully.");
      } else {
        console.log("Reset cancelled.");
      }
    });

  program
    .command("index")
    .description("Index a folder")
    .argument("<folderPath>", "Path to the folder to index")
    .argument("[projectName]", "Name of the project (defaults to folder name)")
    .option("--force", "Force a full re-index (clears existing data)", false)
    .action(async (folderPath, projectName, options) => {
      console.log(`Starting indexing for ${folderPath}...`);
      const result = await handleIndexFolder(folderPath, projectName, "default", config.summarize, false, !!options.force);
      console.log(result.content[0].text);
      await closeDb();
    });

  program
    .command("search")
    .description("Search the knowledge base")
    .argument("<query>", "Search query")
    .action(async (query) => {
      await interactiveSearch(query);
      await closeDb();
    });

  program.action(async () => {
    const opts = program.opts();
    const isDefaultMode = program.getOptionValueSource("mcp") === "default";
    if (isDefaultMode && process.stdin.isTTY && process.argv.length === 2) {
      program.help();
      return;
    }
    const mode = opts.mcp === true ? "stdio" : opts.mcp;
    const port = parseInt(opts.port);
    await startServer(mode, port);
  });

  await program.parseAsync(process.argv);
}

main().catch(console.error);
