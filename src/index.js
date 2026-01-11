#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Command } from "commander";
import fs from "fs-extra";
import { logger, LogLevel } from "./logger.js";
import { configureEnvironment, embeddingManager, summarizerManager } from "./embeddings.js";
import { closeDb, compactDatabase, initDB } from "./db.js";
import { handleIndexFolder, stopIndexing } from "./core.js";
import { server, app } from "./server.js";
import { initWatcher } from "./watcher.js";
import { loadConfig, interactiveConfig } from "./config.js";
import { interactiveSearch } from "./tui.js";
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
      const distPath = path.join(__dirname, "../ui/dist");
      app.use('/*', serveStatic({ root: path.relative(process.cwd(), distPath) }));
      // Fallback for SPA
      app.get('*', async (c, next) => {
        const url = new URL(c.req.url);
        if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/mcp')) {
          const html = await fs.readFile(path.join(distPath, "index.html"), "utf-8");
          return c.html(html);
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
    .version("0.5.0")
    .option("--models-path <path>", "Path to local models directory", config.modelsPath || process.env.MODELS_PATH)
    .option("--offline", "Force offline mode", process.env.OFFLINE_MODE === "true")
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

    if (opts.modelsPath) {
      configureEnvironment(opts.modelsPath, opts.offline);
    }

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
      
      await initDB({
        type: config.dbProvider || "local",
        accountId: config.cloudflareAccountId,
        apiToken: config.cloudflareToken,
        indexName: config.cloudflareVectorizeIndex
      });
      await initWatcher(force);
      const port = parseInt(opts.port);
      await startServer("http", port, true);
    });

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

    if (opts.modelsPath) {
      configureEnvironment(opts.modelsPath, opts.offline);
    }

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

    await initDB({
      type: config.dbProvider || "local",
      accountId: config.cloudflareAccountId,
      apiToken: config.cloudflareToken,
      indexName: config.cloudflareVectorizeIndex
    });

    await initWatcher();
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
    .action(async () => {
      await initDB({
        type: config.dbProvider || "local",
        accountId: config.cloudflareAccountId,
        apiToken: config.cloudflareToken,
        indexName: config.cloudflareVectorizeIndex
      });
      await initWatcher();
      const port = parseInt(program.opts().port);
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
