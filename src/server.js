import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import fs from "fs-extra";
import chokidar from "chokidar";
import { logger } from "./logger.js";
import {
  handleIndexFolder,
  handleSearchCode,
  searchCode,
  chatWithCode,
  indexSingleFile,
  indexingProgress 
} from "./core.js";
import {
  listKnowledgeBase,
  clearDatabase,
  deleteFileData,
  getFileDependencies,
  getAllDependencies,
  findSymbolUsages,
  moveProjectToCollection,
  getWatchList
} from "./db.js";
import { watchProject, unwatchProject } from "./watcher.js";
import { embeddingManager, summarizerManager } from "./embeddings.js";
import { loadConfig } from "./config.js";

export const server = new Server(
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
      return await watchProject(args.folderPath, args.projectName, args.collection);
    }
    if (name === "read_code_range") {
      const content = await fs.readFile(args.filePath, "utf-8");
      const lines = content.split("\n");
      return { content: [{ type: "text", text: lines.slice(args.startLine - 1, args.endLine).join("\n") }] };
    }
    if (name === "clear_index") { await clearDatabase(); return { content: [{ type: "text", text: "Cleared." }] }; }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    logger.error(`Tool execution error: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

/**
 * REST API Handlers for Web UI
 */
export async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathName = url.pathname;

  if (!pathName.startsWith("/api/")) {
    return false;
  }

  try {
    if (pathName === "/api/kb" && req.method === "GET") {
      const kb = await listKnowledgeBase();
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(kb));
      return true;
    }

    if (pathName === "/api/search" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { query, collection, projectName } = JSON.parse(body);
      const results = await searchCode(query, collection, projectName);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(results));
      return true;
    }

    if (pathName === "/api/chat" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { query, collection, projectName } = JSON.parse(body);
      const response = await chatWithCode(query, collection, projectName);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ response }));
      return true;
    }

    if (pathName === "/api/stats" && req.method === "GET") {
      const kb = await listKnowledgeBase();
      const projectCount = Object.values(kb).reduce((acc, p) => acc + p.length, 0);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        collections: Object.keys(kb).length,
        projects: projectCount,
        status: "active"
      }));
      return true;
    }

    if (pathName === "/api/config" && req.method === "GET") {
      const config = await loadConfig();
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(config));
      return true;
    }

    if (pathName === "/api/watchers" && req.method === "GET") {
      const watchers = await getWatchList();
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(watchers));
      return true;
    }

    if (pathName === "/api/watchers" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { folderPath, projectName, collection } = JSON.parse(body);
      await watchProject(folderPath, projectName, collection);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true }));
      return true;
    }

    if (pathName === "/api/watchers" && req.method === "DELETE") {
      const folderPath = url.searchParams.get("folderPath");
      if (folderPath) {
        await unwatchProject(folderPath);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "folderPath required" }));
      }
      return true;
    }
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  return false;
}
