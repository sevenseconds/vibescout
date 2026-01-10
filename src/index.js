#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { glob } from "glob";
import fs from "fs-extra";
import { extractCodeBlocks } from "./extractor.js";
import { embeddingManager, rerankerManager, summarizerManager, configureEnvironment } from "./embeddings.js";
import { 
  createOrUpdateTable, 
  hybridSearch, 
  listKnowledgeBase, 
  clearDatabase, 
  closeDb,
  getStoredModel, 
  getFileHash, 
  bulkUpdateFileHashes,
  updateFileHash,
  deleteFileData, 
  getProjectFiles,
  updateDependencies,
  getFileDependencies,
  findSymbolUsages,
  moveProjectToCollection
} from "./db.js";
import path from "path";
import crypto from "crypto";
import chokidar from "chokidar";
import { Command } from "commander";

const server = new Server(
  {
    name: "vibescout",
    version: "0.5.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const watchers = new Map();
const CONCURRENCY_LIMIT = 4;

// Global state for progress tracking
let indexingProgress = {
  active: false,
  projectName: "",
  totalFiles: 0,
  processedFiles: 0,
  status: "idle"
};

/**
 * Tool: index_folder
 * @param {boolean} summarize - Default is now TRUE for high accuracy
 * @param {boolean} background - If true, return immediately and index in background
 */
export async function handleIndexFolder(folderPath, projectName, collection = "default", summarize = true, background = false) {
  const absolutePath = path.resolve(folderPath);
  const derivedProjectName = projectName || path.basename(absolutePath);
  const filesOnDisk = await glob("**/*.{ts,js,md}", { cwd: absolutePath, ignore: ["**/node_modules/**", "**/dist/**"] });
  const absoluteFilesOnDisk = new Set(filesOnDisk.map(f => path.join(absolutePath, f)));
  
  if (indexingProgress.active) {
    return { content: [{ type: "text", text: `Error: An indexing task for "${indexingProgress.projectName}" is already in progress.` }], isError: true };
  }

  // Update progress state
  indexingProgress = {
    active: true,
    projectName: derivedProjectName,
    totalFiles: filesOnDisk.length,
    processedFiles: 0,
    status: "indexing"
  };

  const runIndexing = async () => {
    try {
      let totalIndexed = 0;
      let skipped = 0;
      let pruned = 0;

      // 1. Pruning
      const knownFiles = await getProjectFiles(derivedProjectName);
      for (const knownFile of knownFiles) {
        if (knownFile.startsWith(absolutePath) && !absoluteFilesOnDisk.has(knownFile)) {
          await deleteFileData(knownFile);
          pruned++;
        }
      }

      const queue = [...filesOnDisk];
      const hashUpdates = [];
      
      const processFile = async (file) => {
        const filePath = path.join(absolutePath, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const hash = crypto.createHash("md5").update(content).digest("hex");
          const existingHash = await getFileHash(filePath);

          if (existingHash === hash) {
            skipped++;
            indexingProgress.processedFiles++;
            return;
          }

          if (existingHash) await deleteFileData(filePath);

          const { blocks, metadata } = await extractCodeBlocks(filePath);
          await updateDependencies(filePath, derivedProjectName, collection, metadata);

          if (blocks.length > 0) {
            const parentSummaries = new Map();
            if (summarize) {
              const parents = blocks.filter(b => b.type !== "chunk");
              for (const parent of parents) {
                const summary = await summarizerManager.summarize(parent.content);
                parentSummaries.set(parent.name, summary);
              }
            }

            const dataToInsert = [];
            for (const block of blocks) {
              const summary = block.type === "chunk" 
                ? parentSummaries.get(block.parentName) || "" 
                : parentSummaries.get(block.name) || "";

              const contextPrefix = summary ? `Context: ${summary}\n\n` : "";
              const textToEmbed = `Collection: ${collection}\nProject: ${derivedProjectName}\nFile: ${file}\nType: ${block.type}\nName: ${block.name}\nComments: ${block.comments}\nCode: ${contextPrefix}${block.content.substring(0, 500)}`;

              const vector = await embeddingManager.generateEmbedding(textToEmbed);
              dataToInsert.push({
                vector, collection, projectName: derivedProjectName, name: block.name, type: block.type,
                filePath, startLine: block.startLine, endLine: block.endLine,
                comments: block.comments, content: block.content, summary
              });
            }
            await createOrUpdateTable(dataToInsert, embeddingManager.getModel());
            totalIndexed += blocks.length;
          }
          hashUpdates.push({ filePath, hash });
          indexingProgress.processedFiles++;
        } catch (err) {
          console.error(`Error processing ${file}: ${err.message}`);
          indexingProgress.processedFiles++;
        }
      };

      const workers = new Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
        while (queue.length > 0) {
          const file = queue.shift();
          if (file) await processFile(file);
        }
      });

      await Promise.all(workers);
      if (hashUpdates.length > 0) await bulkUpdateFileHashes(hashUpdates);
      
      indexingProgress.active = false;
      indexingProgress.status = "completed";
      console.error(`[VibeScout] Indexing complete for ${derivedProjectName}`);
      
      return { totalIndexed, skipped, pruned };
    } catch (err) {
      indexingProgress.active = false;
      indexingProgress.status = `error: ${err.message}`;
      throw err;
    }
  };

  if (background) {
    // Fire and forget
    runIndexing().catch(console.error);
    return {
      content: [{ type: "text", text: `Started background indexing for "${derivedProjectName}" (${filesOnDisk.length} files). You can check progress using "get_indexing_status".` }],
    };
  } else {
    // Wait for completion
    const result = await runIndexing();
    return {
      content: [{ type: "text", text: `Sync complete. Indexed: ${result.totalIndexed} blocks, Skipped: ${result.skipped}, Pruned: ${result.pruned}.` }],
    };
  }
}

/**
 * Tool: search_code
 */
export async function handleSearchCode(query, collection, projectName) {
  const currentModel = embeddingManager.getModel();
  const storedModel = await getStoredModel();
  
  if (storedModel && storedModel !== currentModel) {
    console.error(`[Auto-Switch] Switching model from "${currentModel}" to stored model "${storedModel}" to match index.`);
    await embeddingManager.setModel(storedModel);
  }

  const queryVector = await embeddingManager.generateEmbedding(query);
  const rawResults = await hybridSearch(query, queryVector, { collection, projectName, limit: 15 });
  const results = await rerankerManager.rerank(query, rawResults, 5);

  const formattedResults = results.map(r => 
    `[Score: ${r.rerankScore.toFixed(4)}] [Project: ${r.projectName}]\nFile: ${r.filePath} (${r.startLine}-${r.endLine})\nSummary: ${r.summary || "N/A"}\n---`
  ).join("\n\n");

  return { content: [{ type: "text", text: formattedResults || "No matches found." }] };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "index_folder",
        description: "Index a folder with Contextual AI Enrichment.",
        inputSchema: {
          type: "object",
          properties: {
            folderPath: { type: "string" },
            projectName: { type: "string" },
            collection: { type: "string" },
            summarize: {
              type: "boolean",
              description: "Use Hierarchical Context (pre-summarize functions). Slower but significantly more accurate. Default is true."
            },
            background: {
              type: "boolean",
              description: "If true, starts indexing in the background and returns immediately. Recommended for large projects."
            }
          },
          required: ["folderPath"],
        },
      },
      {
        name: "get_indexing_status",
        description: "Check the progress of the current background indexing task.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "search_code",
        description: "Search across knowledge base with Reranking.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            collection: { type: "string" },
            projectName: { type: "string" },
          },
          required: ["query"],
        },
      },
      {
        name: "move_project",
        description: "Move a project from one collection to another",
        inputSchema: {
          type: "object",
          properties: {
            projectName: { type: "string" },
            newCollection: { type: "string" },
          },
          required: ["projectName", "newCollection"],
        },
      },
      {
        name: "get_file_dependencies",
        description: "Get imports and exports for a specific file",
        inputSchema: {
          type: "object",
          properties: { filePath: { type: "string" } },
          required: ["filePath"],
        },
      },
      {
        name: "find_symbol_usages",
        description: "Find which files import a specific symbol",
        inputSchema: {
          type: "object",
          properties: { symbolName: { type: "string" } },
          required: ["symbolName"],
        },
      },
      {
        name: "list_knowledge_base",
        description: "List all indexed projects",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "watch_folder",
        description: "Watch a folder for real-time indexing",
        inputSchema: {
          type: "object",
          properties: { folderPath: { type: "string" }, projectName: { type: "string" }, collection: { type: "string" } },
          required: ["folderPath"],
        },
      },
      {
        name: "read_code_range",
        description: "Read lines from a file",
        inputSchema: {
          type: "object",
          properties: { filePath: { type: "string" }, startLine: { type: "number" }, endLine: { type: "number" } },
          required: ["filePath", "startLine", "endLine"],
        },
      },
      {
        name: "get_current_model",
        description: "Get active models",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "set_model",
        description: "Switch Embedding model (e.g., Xenova/bge-small-en-v1.5). Note: You should clear the index after switching models.",
        inputSchema: {
          type: "object",
          properties: { modelName: { type: "string" } },
          required: ["modelName"],
        },
      },
      {
        name: "clear_index",
        description: "Clear entire database",
        inputSchema: { type: "object", properties: {} }
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "index_folder") {
      const shouldSummarize = args.summarize !== undefined ? args.summarize : true;
      return await handleIndexFolder(args.folderPath, args.projectName, args.collection, shouldSummarize, !!args.background);
    }
    if (name === "get_indexing_status") {
      const { active, projectName, totalFiles, processedFiles, status } = indexingProgress;
      if (!active && status === "idle") return { content: [{ type: "text", text: "No indexing task has been run yet." }] };
      
      const percent = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;
      const msg = active 
        ? `Indexing "${projectName}": ${percent}% complete (${processedFiles}/${totalFiles} files).`
        : `Last task ("${projectName}") status: ${status}.`;
      
      return { content: [{ type: "text", text: msg }] };
    }
    if (name === "search_code") return await handleSearchCode(args.query, args.collection, args.projectName);
    if (name === "move_project") {
      await moveProjectToCollection(args.projectName, args.newCollection);
      return { content: [{ type: "text", text: `Moved to ${args.newCollection}` }] };
    }
    if (name === "get_file_dependencies") {
      const deps = await getFileDependencies(path.resolve(args.filePath));
      return { content: [{ type: "text", text: JSON.stringify(deps, null, 2) }] };
    }
    if (name === "find_symbol_usages") {
      const usages = await findSymbolUsages(args.symbolName);
      return { content: [{ type: "text", text: JSON.stringify(usages, null, 2) }] };
    }
    if (name === "get_current_model") {
      return { content: [{ type: "text", text: `Embedding: ${embeddingManager.getModel()}\nSummarizer: ${summarizerManager.modelName}` }] };
    }
    if (name === "set_model") {
      await embeddingManager.setModel(args.modelName);
      return { content: [{ type: "text", text: `Embedding model set to ${args.modelName}. Please clear your index if switching architectures.` }] };
    }
    if (name === "list_knowledge_base") {
      const kb = await listKnowledgeBase();
      const text = Object.entries(kb).map(([col, projs]) => `Collection "${col}":\n - ${projs.join("\n - ")}`).join("\n\n");
      return { content: [{ type: "text", text: text || "Empty." }] };
    }
    if (name === "watch_folder") {
      const absolutePath = path.resolve(args.folderPath);
      const derivedProjectName = args.projectName || path.basename(absolutePath);
      if (watchers.has(absolutePath)) return { content: [{ type: "text", text: "Already watching." }] };
      const watcher = chokidar.watch(absolutePath, { 
        ignored: ["**/node_modules/**", "**/.git/**"], 
        persistent: true, 
        ignoreInitial: true,
        usePolling: process.env.USE_POLLING === "true",
        interval: 1000
      });
      watcher.on("add", f => indexSingleFile(f, derivedProjectName, args.collection || "default"))
        .on("change", f => indexSingleFile(f, derivedProjectName, args.collection || "default"))
        .on("unlink", f => deleteFileData(f));
      watchers.set(absolutePath, watcher);
      return { content: [{ type: "text", text: `Watching ${derivedProjectName}` }] };
    }
    if (name === "read_code_range") {
      const content = await fs.readFile(args.filePath, "utf-8");
      const lines = content.split("\n");
      return { content: [{ type: "text", text: lines.slice(args.startLine - 1, args.endLine).join("\n") }] };
    }
    if (name === "clear_index") { await clearDatabase(); return { content: [{ type: "text", text: "Cleared." }] }; }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function indexSingleFile(filePath, projectName, collection) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const hash = crypto.createHash("md5").update(content).digest("hex");
    const existingHash = await getFileHash(filePath);
    if (existingHash === hash) return;
    if (existingHash) await deleteFileData(filePath);

    const { blocks, metadata } = await extractCodeBlocks(filePath);
    await updateDependencies(filePath, projectName, collection, metadata);

    if (blocks.length > 0) {
      const parentSummaries = new Map();
      // Pre-summarize for hierarchical context
      for (const parent of blocks.filter(b => b.type !== "chunk")) {
        parentSummaries.set(parent.name, await summarizerManager.summarize(parent.content));
      }

      const dataToInsert = blocks.map(block => {
        const summary = block.type === "chunk" ? parentSummaries.get(block.parentName) || "" : parentSummaries.get(block.name) || "";
        const contextPrefix = summary ? `Context: ${summary}\n\n` : "";
        const textToEmbed = `Project: ${projectName}\nFile: ${path.basename(filePath)}\nSummary: ${summary}\nCode: ${contextPrefix}${block.content.substring(0, 500)}`;
        return {
          vector: null, textToEmbed, collection, projectName, name: block.name, type: block.type,
          filePath, startLine: block.startLine, endLine: block.endLine,
          comments: block.comments, content: block.content, summary
        };
      });

      for (const item of dataToInsert) {
        item.vector = await embeddingManager.generateEmbedding(item.textToEmbed);
        delete item.textToEmbed;
      }
      await createOrUpdateTable(dataToInsert, embeddingManager.getModel());
    }
    await updateFileHash(filePath, hash);
  } catch (err) {
    console.error(`[Watcher] Error: ${err.message}`);
  }
}

async function main() {
  const program = new Command();

  program
    .name("vibescout")
    .description("Local Code Search MCP Server")
    .version("0.1.0")
    .option("--models-path <path>", "Path to local models directory", process.env.MODELS_PATH)
    .option("--offline", "Force offline mode", process.env.OFFLINE_MODE === "true")
    .option("--mcp <mode>", "MCP transport mode (stdio, sse, http)");

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.modelsPath) {
      configureEnvironment(opts.modelsPath, opts.offline);
    }
  });

  program
    .command("index")
    .description("Index a folder")
    .argument("<folderPath>", "Path to the folder to index")
    .argument("[projectName]", "Name of the project (defaults to folder name)")
    .action(async (folderPath, projectName) => {
      console.log(`Starting indexing for ${folderPath}...`);
      const result = await handleIndexFolder(folderPath, projectName, "default", true, false);
      console.log(result.content[0].text);
      await closeDb();
    });

  program
    .command("search")
    .description("Search the knowledge base")
    .argument("<query>", "Search query")
    .action(async (query) => {
      console.log(`Searching for: "${query}"...`);
      const result = await handleSearchCode(query);
      console.log(result.content[0].text);
      await closeDb();
    });

  // Default action: Start MCP Server
  program.action(async () => {
    const opts = program.opts();
    const mode = opts.mcp || (process.stdin.isTTY ? null : "stdio");

    if (!mode) {
      program.help();
      return;
    }

    if (opts.modelsPath) {
      console.error(`Using local models from: ${opts.modelsPath}${opts.offline ? " (Offline Mode)" : ""}`);
    }

    const port = process.env.PORT || 3000;

    if (mode === "sse") {
      console.error(`Starting MCP SSE Server on port ${port}...`);
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
      console.error(`Starting MCP HTTP Streamable Server on port ${port}...`);
      const transport = new StreamableHTTPServerTransport();
      await server.connect(transport);

      const httpServer = http.createServer(async (req, res) => {
        try {
          await transport.handleRequest(req, res);
        } catch (err) {
          console.error("Error handling request:", err);
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
      console.error("Local Code Search MCP Server running (stdio)");
    }
  });

  await program.parseAsync(process.argv);
}

main().catch(console.error);