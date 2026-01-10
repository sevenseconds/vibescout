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
    version: "1.8.0",
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
export async function handleIndexFolder(folderPath, projectName, collection = "default", summarize = false) {
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
        const dataToInsert = [];
        for (const block of blocks) {
          let summary = "";
          if (summarize) {
            summary = await summarizerManager.summarize(block.content);
          }

          const textToEmbed = `
            Collection: ${collection}
            Project: ${derivedProjectName}
            File: ${file}
            Type: ${block.type}
            Name: ${block.name}
            Summary: ${summary}
            Comments: ${block.comments}
            Code: ${block.content.substring(0, 500)}
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
    content: [{ type: "text", text: `Sync complete. Indexed: ${totalIndexed} blocks (Summarized: ${summarize}), Skipped: ${skipped}, Pruned: ${pruned}.` }],
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
    `[Score: ${r.rerankScore.toFixed(4)}] [Project: ${r.projectName}]
File: ${r.filePath} (${r.startLine}-${r.endLine})
Summary: ${r.summary || "N/A"}
---`
  ).join("\n\n");

  return { content: [{ type: "text", text: formattedResults || "No matches found." }] };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "index_folder",
        description: "Index a folder with optional AI summarization.",
        inputSchema: {
          type: "object",
          properties: {
            folderPath: { type: "string" },
            projectName: { type: "string" },
            collection: { type: "string" },
            summarize: { 
              type: "boolean", 
              description: "Extremely slow. ONLY use if the user explicitly asks for 'high accuracy' or 'summarized' indexing. Default is false." 
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
        name: "set_model",
        description: "Switch embedding model (requires re-indexing).",
        inputSchema: {
          type: "object",
          properties: {
            modelName: { type: "string", enum: ["Xenova/all-MiniLM-L6-v2", "Xenova/bge-small-en-v1.5", "Xenova/bge-m3"] },
          },
          required: ["modelName"],
        },
      },
      { name: "get_current_model", description: "Get active models", inputSchema: { type: "object", properties: {} } },
      { name: "list_knowledge_base", description: "List indexed projects", inputSchema: { type: "object", properties: {} } },
      { name: "clear_index", description: "Clear entire database", inputSchema: { type: "object", properties: {} } },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "index_folder") return await handleIndexFolder(args.folderPath, args.projectName, args.collection, args.summarize);
    if (name === "search_code") return await handleSearchCode(args.query, args.collection, args.projectName);
    if (name === "get_current_model") {
      return { content: [{ type: "text", text: `Embedding: ${embeddingManager.getModel()}
Summarizer: ${summarizerManager.modelName}` }] };
    }
    if (name === "set_model") {
      await embeddingManager.setModel(args.modelName);
      return { content: [{ type: "text", text: `Embedding model set to ${args.modelName}. Please clear and re-index.` }] };
    }
    if (name === "list_knowledge_base") {
      const kb = await listKnowledgeBase();
      const text = Object.entries(kb).map(([col, projs]) => `Collection "${col}":
 - ${projs.join("\n - ")}`).join("\n\n");
      return { content: [{ type: "text", text: text || "Empty." }] };
    }
    if (name === "clear_index") { await clearDatabase(); return { content: [{ type: "text", text: "Cleared." }] }; }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Local Code Search MCP Server running");
}

main().catch(console.error);
