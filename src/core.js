import { glob } from "glob";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import { extractCodeBlocks } from "./extractor.js";
import { embeddingManager, rerankerManager, summarizerManager } from "./embeddings.js";
import { logger } from "./logger.js";
import { 
  createOrUpdateTable, 
  hybridSearch, 
  getStoredModel, 
  getFileHash, 
  bulkUpdateFileHashes,
  updateFileHash,
  deleteFileData, 
  getProjectFiles,
  updateDependencies
} from "./db.js";

const CONCURRENCY_LIMIT = 4;

// Global state for progress tracking
export let indexingProgress = {
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
  const filesOnDisk = await glob("**/*.{ts,js,md,py,go,dart,java,kt,kts,json,toml,xml,html,svg}", { cwd: absolutePath, ignore: ["**/node_modules/**", "**/dist/**"] });
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
    logger.info(`[Auto-Switch] Switching model from "${currentModel}" to stored model "${storedModel}" to match index.`);
    await embeddingManager.setModel(storedModel);
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

export async function indexSingleFile(filePath, projectName, collection) {
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
    logger.error(`[Watcher] Error: ${err.message}`);
  }
}
