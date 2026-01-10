#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";
import { Command } from "commander";
import { logger, LogLevel } from "./logger.js";
import { configureEnvironment, embeddingManager, summarizerManager } from "./embeddings.js";
import { closeDb, compactDatabase, initDB } from "./db.js";
import { handleIndexFolder } from "./core.js";
import { server, handleApiRequest } from "./server.js";
import { loadConfig, interactiveConfig } from "./config.js";
import { interactiveSearch } from "./tui.js";
import sirv from "sirv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer(mode, port, isUI = false) {
  if (mode === "sse" || mode === "http") {
    const isSSE = mode === "sse";
    logger.info(`Starting MCP ${isSSE ? "SSE" : "HTTP"} Server on port ${port}${isUI ? " (with Web UI)" : ""}...`);
    
    // Standardize on /mcp endpoint
    const transport = new StreamableHTTPServerTransport({ endpoint: "/mcp" });
    await server.connect(transport);

    const assets = isUI ? sirv(path.join(__dirname, "../ui/dist"), { dev: false, single: true }) : null;

    const httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathName = url.pathname;

      // 1. Handle API requests
      if (pathName.startsWith("/api/")) {
        const isApi = await handleApiRequest(req, res);
        if (isApi) return;
      }

      // 2. Handle MCP transport (only on /mcp path)
      if (pathName === "/mcp") {
        try {
          await transport.handleRequest(req, res);
          return;
        } catch (err) {
          logger.error("Error handling MCP request:", err);
        }
      }

      // 3. Handle UI assets (fallback)
      if (assets && !res.headersSent) {
        assets(req, res);
      } else if (!res.headersSent) {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    
    httpServer.listen(port);
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
    .version("0.1.0")
    .option("--models-path <path>", "Path to local models directory", config.modelsPath || process.env.MODELS_PATH)
    .option("--offline", "Force offline mode", process.env.OFFLINE_MODE === "true")
    .option("--mcp [mode]", "MCP transport mode (stdio, sse, http)", "stdio")
    .option("--port <number>", "Port for sse or http mode", config.port || process.env.PORT || 3000)
    .option("--verbose", "Enable verbose logging", config.verbose || false);

  program.hook("preAction", async (thisCommand) => {
    const opts = thisCommand.opts();
    logger.setLevel(opts.verbose ? LogLevel.DEBUG : LogLevel.INFO);

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
          config.openaiKey,
      accountId: config.cloudflareAccountId
    };

    await embeddingManager.setProvider(providerConfig);
    await summarizerManager.setProvider(providerConfig);

    await initDB({
      type: config.dbProvider || "local",
      accountId: config.cloudflareAccountId,
      apiToken: config.cloudflareToken,
      indexName: config.cloudflareVectorizeIndex
    });
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
    .action(async (folderPath, projectName) => {
      console.log(`Starting indexing for ${folderPath}...`);
      const result = await handleIndexFolder(folderPath, projectName, "default", config.summarize, false);
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