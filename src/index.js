#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";
import { Command } from "commander";
import { logger, LogLevel } from "./logger.js";
import { configureEnvironment, embeddingManager } from "./embeddings.js";
import { closeDb, compactDatabase } from "./db.js";
import { handleIndexFolder, handleSearchCode } from "./core.js";
import { server } from "./server.js";
import { loadConfig, interactiveConfig } from "./config.js";
import { interactiveSearch } from "./tui.js";

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

    if (config.embeddingModel) {
      await embeddingManager.setModel(config.embeddingModel);
    }
  });

  program
    .command("config")
    .description("Interactive configuration TUI")
    .action(async () => {
      await interactiveConfig();
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

  // Default action: Start MCP Server
  program.action(async () => {
    const opts = program.opts();
    const isDefaultMode = program.getOptionValueSource("mcp") === "default";
    
    // If running in a terminal without an explicit transport mode, show help.
    if (isDefaultMode && process.stdin.isTTY && process.argv.length === 2) {
      program.help();
      return;
    }

    if (opts.modelsPath) {
      logger.info(`Using local models from: ${opts.modelsPath}${opts.offline ? " (Offline Mode)" : ""}`);
    }

    const mode = opts.mcp === true ? "stdio" : opts.mcp;
    const port = parseInt(opts.port);

    if (mode === "sse") {
      logger.info(`Starting MCP SSE Server on port ${port}...`);
      const httpServer = http.createServer(async (req, res) => {
        if (req.url === "/sse") {
          const transport = new SSEServerTransport("/messages", res);
          await server.connect(transport);
        } else {
          res.writeHead(404);
          res.end("Not Found. Use /sse for connection.");
        }
      });
      httpServer.listen(port);
      return;
    }

    if (mode === "http") {
      logger.info(`Starting MCP HTTP Streamable Server on port ${port}...`);
      const transport = new StreamableHTTPServerTransport();
      await server.connect(transport);

      const httpServer = http.createServer(async (req, res) => {
        try {
          await transport.handleRequest(req, res);
        } catch (err) {
          logger.error("Error handling request:", err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end("Internal Server Error");
          }
        }
      });
      httpServer.listen(port);
      return;
    }

    if (mode === "stdio") {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info("Local Code Search MCP Server running (stdio)");
    }
  });

  await program.parseAsync(process.argv);
}

main().catch(console.error);
