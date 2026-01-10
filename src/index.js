import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { glob } from "glob";
import fs from "fs-extra";
import { extractCodeBlocks } from "./extractor.js";
import { embeddingManager, rerankerManager, summarizerManager } from "./embeddings.js";
import { 
  createOrUpdateTable, 
  hybridSearch, 
  listKnowledgeBase, 
  clearDatabase, 
  getStoredModel, 
  getFileHash, 
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
    version: "1.9.0",
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
 * @param {boolean} summarize - Default is now TRUE for high accuracy
 */
export async function handleIndexFolder(folderPath, projectName, collection = "default", summarize = true) {
  const absolutePath = path.resolve(folderPath);
  const derivedProjectName = projectName || path.basename(absolutePath);
  const filesOnDisk = await glob("**/*.{ts,js}", { cwd: absolutePath, ignore: ["**/node_modules/**", "**/dist/**"] });
  const absoluteFilesOnDisk = new Set(filesOnDisk.map(f => path.join(absolutePath, f)));
  
  let totalIndexed = 0;
  let skipped = 0;
  let pruned = 0;

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
        return;
      }

      if (existingHash) await deleteFileData(filePath);

      const { blocks, metadata } = await extractCodeBlocks(filePath);
      await updateDependencies(filePath, derivedProjectName, collection, metadata);

      if (blocks.length > 0) {
        // --- Hierarchical Summarization Logic ---
        const parentSummaries = new Map();
        
        // 1. First pass: Generate summaries for parent blocks (classes/methods/functions)
        if (summarize) {
          const parents = blocks.filter(b => b.type !== "chunk");
          for (const parent of parents) {
            const summary = await summarizerManager.summarize(parent.content);
            parentSummaries.set(parent.name, summary);
          }
        }

        const dataToInsert = [];
        for (const block of blocks) {
          // If this is a chunk, it inherits context from its parent's summary
          const summary = block.type === "chunk" 
            ? parentSummaries.get(block.parentName) || "" 
            : parentSummaries.get(block.name) || "";

          const contextPrefix = summary ? `Context: ${summary}\n\n` : "";
          const textToEmbed = `
            Collection: ${collection}
            Project: ${derivedProjectName}
            File: ${file}
            Type: ${block.type}
            Name: ${block.name}
            Comments: ${block.comments}
            Code: ${contextPrefix}${block.content.substring(0, 500)}
          `.trim();

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
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
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

  return {
    content: [{ type: "text", text: `Sync complete. Indexed: ${totalIndexed} blocks (Hierarchical Summarization: ${summarize}), Skipped: ${skipped}, Pruned: ${pruned}.` }],
  };
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
            }
          },
          required: ["folderPath"],
        },
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
      { name: "get_current_model", description: "Get active models", inputSchema: { type: "object", properties: {} } },
      { name: "clear_index", description: "Clear entire database", inputSchema: { type: "object", properties: {} } },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "index_folder") {
      // Allow explicit false, otherwise default to true
      const shouldSummarize = args.summarize !== undefined ? args.summarize : true;
      return await handleIndexFolder(args.folderPath, args.projectName, args.collection, shouldSummarize);
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Local Code Search MCP Server running");
}

main().catch(console.error);