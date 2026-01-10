import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { glob } from "glob";
import fs from "fs-extra";
import { extractCodeBlocks } from "./extractor.js";
import { embeddingManager, rerankerManager } from "./embeddings.js";
import { 
  createOrUpdateTable, 
  hybridSearch, 
  listKnowledgeBase, 
  clearDatabase, 
  getStoredModel, 
  getFileHash, 
  updateFileHash, 
  bulkUpdateFileHashes,
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

const server = new Server(
  {
    name: "local-code-search",
    version: "1.7.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const watchers = new Map();
const CONCURRENCY_LIMIT = 4;

/**
 * Tool: index_folder
 */
export async function handleIndexFolder(folderPath, projectName, collection = "default") {
  const absolutePath = path.resolve(folderPath);
  const derivedProjectName = projectName || path.basename(absolutePath);
  const filesOnDisk = await glob("**/*.{ts,js}", { cwd: absolutePath, ignore: ["**/node_modules/**", "**/dist/**"] });
  const absoluteFilesOnDisk = new Set(filesOnDisk.map(f => path.join(absolutePath, f)));
  
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

  // 2. Parallel Processing with Concurrency Limit
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
        return;
      }

      if (existingHash) await deleteFileData(filePath);

      const { blocks, metadata } = await extractCodeBlocks(filePath);
      await updateDependencies(filePath, derivedProjectName, collection, metadata);

      if (blocks.length > 0) {
        const dataToInsert = [];
        for (const block of blocks) {
          const textToEmbed = `Collection: ${collection}\nProject: ${derivedProjectName}\nFile: ${file}\nType: ${block.type}\nName: ${block.name}\nComments: ${block.comments}\nCode: ${block.content.substring(0, 500)}`;
          const vector = await embeddingManager.generateEmbedding(textToEmbed);
          dataToInsert.push({
            vector, collection, projectName: derivedProjectName, name: block.name, type: block.type,
            filePath, startLine: block.startLine, endLine: block.endLine,
            comments: block.comments, content: block.content
          });
        }
        await createOrUpdateTable(dataToInsert, embeddingManager.getModel());
        totalIndexed += blocks.length;
      }
      hashUpdates.push({ filePath, hash });
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
    }
  };

  // Run workers
  const workers = new Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      if (file) await processFile(file);
    }
  });

  await Promise.all(workers);
  
  // Bulk update hashes at the end
  if (hashUpdates.length > 0) {
    await bulkUpdateFileHashes(hashUpdates);
  }

  return {
    content: [{ type: "text", text: `Sync complete for "${derivedProjectName}". Indexed: ${totalIndexed} blocks, Skipped: ${skipped} files, Pruned: ${pruned} deleted files.` }],
  };
}

/**
 * Helper to index a single file
 */
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
      const fileName = path.basename(filePath);
      const dataToInsert = [];
      for (const block of blocks) {
        const textToEmbed = `Collection: ${collection}\nProject: ${projectName}\nFile: ${fileName}\nType: ${block.type}\nName: ${block.name}\nComments: ${block.comments}\nCode: ${block.content.substring(0, 500)}`;
        const vector = await embeddingManager.generateEmbedding(textToEmbed);
        dataToInsert.push({
          vector, collection, projectName, name: block.name, type: block.type,
          filePath, startLine: block.startLine, endLine: block.endLine,
          comments: block.comments, content: block.content
        });
      }
      await createOrUpdateTable(dataToInsert, embeddingManager.getModel());
    }
    await updateFileHash(filePath, hash);
    console.error(`[Watcher] Updated ${filePath}`);
  } catch (err) {
    console.error(`[Watcher] Error indexing ${filePath}: ${err.message}`);
  }
}

/**
 * Tool: search_code
 */
export async function handleSearchCode(query, collection, projectName) {
  const currentModel = embeddingManager.getModel();
  const storedModel = await getStoredModel();
  if (storedModel && storedModel !== currentModel) {
    return { content: [{ type: "text", text: `Error: Model Mismatch! Database uses "${storedModel}".` }], isError: true };
  }

  const queryVector = await embeddingManager.generateEmbedding(query);
  const rawResults = await hybridSearch(query, queryVector, { collection, projectName, limit: 15 });
  const results = await rerankerManager.rerank(query, rawResults, 5);

  const formattedResults = results.map(r => 
    `[Score: ${r.rerankScore.toFixed(4)}] [Collection: ${r.collection}] [Project: ${r.projectName}]\nFile: ${r.filePath}\nType: ${r.type}\nName: ${r.name}\nLines: ${r.startLine}-${r.endLine}\n---`
  ).join("\n\n");

  return { content: [{ type: "text", text: formattedResults || "No matches found." }] };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "index_folder",
        description: "Index a folder and its dependency graph",
        inputSchema: {
          type: "object",
          properties: {
            folderPath: { type: "string" },
            projectName: { type: "string" },
            collection: { type: "string" },
          },
          required: ["folderPath"],
        },
      },
      {
        name: "search_code",
        description: "Semantic + FTS search with Reranking",
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
      { name: "list_knowledge_base", description: "List all indexed projects", inputSchema: { type: "object", properties: {} } },
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
      { name: "get_current_model", description: "Get current embedding model", inputSchema: { type: "object", properties: {} } },
      { name: "clear_index", description: "Clear search index", inputSchema: { type: "object", properties: {} } },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "index_folder") return await handleIndexFolder(args.folderPath, args.projectName, args.collection);
    if (name === "search_code") return await handleSearchCode(args.query, args.collection, args.projectName);
    if (name === "move_project") {
      await moveProjectToCollection(args.projectName, args.newCollection);
      return { content: [{ type: "text", text: `Project "${args.projectName}" moved to collection "${args.newCollection}".` }] };
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
      const watcher = chokidar.watch(absolutePath, { ignored: ["**/node_modules/**", "**/.git/**"], persistent: true, ignoreInitial: true });
      watcher.on("add", f => indexSingleFile(f, derivedProjectName, args.collection || "default"))
             .on("change", f => indexSingleFile(f, derivedProjectName, args.collection || "default"))
             .on("unlink", f => deleteFileData(f));
      watchers.set(absolutePath, watcher);
      return { content: [{ type: "text", text: `Watching ${derivedProjectName}` }] };
    }
    if (name === "get_file_dependencies") {
      const deps = await getFileDependencies(path.resolve(args.filePath));
      return { content: [{ type: "text", text: JSON.stringify(deps, null, 2) || "Not found." }] };
    }
    if (name === "find_symbol_usages") {
      const usages = await findSymbolUsages(args.symbolName);
      return { content: [{ type: "text", text: JSON.stringify(usages, null, 2) }] };
    }
    if (name === "read_code_range") {
      const content = await fs.readFile(args.filePath, "utf-8");
      const lines = content.split("\n");
      return { content: [{ type: "text", text: lines.slice(args.startLine - 1, args.endLine).join("\n") }] };
    }
    if (name === "get_current_model") return { content: [{ type: "text", text: embeddingManager.getModel() }] };
    if (name === "clear_index") { await clearDatabase(); return { content: [{ type: "text", text: "Cleared." }] }; }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function handleReadCodeRange(filePath, startLine, endLine) {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const range = lines.slice(startLine - 1, endLine);
  return { content: [{ type: "text", text: range.join("\n") }] };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Local Code Search MCP Server running");
}

main().catch(console.error);