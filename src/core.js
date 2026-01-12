import { glob } from "glob";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import ignore from "ignore";
import { extractCodeBlocks } from "./extractor.js";
import { embeddingManager, rerankerManager, summarizerManager } from "./embeddings.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import {
  createOrUpdateTable,
  hybridSearch,
  getStoredModel,
  getFileHash,
  bulkUpdateFileHashes,
  updateFileHash,
  deleteFileData,
  getProjectFiles,
  updateDependencies,
  deleteProject
} from "./db.js";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

const CONCURRENCY_LIMIT = 16;

/**
 * Get file type configuration for a given file path
 * Determines whether to summarize and which prompt to use
 */
async function getFileTypeConfig(filePath) {
  const config = await loadConfig();
  const fileTypes = config.fileTypes || {};

  // Find matching file type
  for (const [typeName, typeConfig] of Object.entries(fileTypes)) {
    if (typeConfig.extensions) {
      for (const ext of typeConfig.extensions) {
        // Handle both extensions starting with dot and full filenames
        if (ext.startsWith(".")) {
          if (filePath.endsWith(ext)) {
            return { typeName, ...typeConfig };
          }
        } else {
          // Full filename match (e.g., package-lock.json)
          if (filePath.endsWith('/' + ext) || filePath.endsWith('//' + ext) || filePath === ext) {
            return { typeName, ...typeConfig };
          }
        }
      }
    }
  }

  // Default: treat as code file
  return {
    typeName: "code",
    summarize: true,
    promptTemplate: "summarize",
    description: "Unknown file type"
  };
}

/**
 * Helper to load ignore patterns from .vibeignore and .gitignore
 * Returns both the ignore instance and the raw patterns array
 */
async function getIgnoreFilter(folderPath) {
  const ig = ignore();

  // Default ignores
  const defaultPatterns = [
    ".git",
    "node_modules",
    "dist",
    ".lancedb",
    ".lancedb_test",
    ".vibescout",
    // Lock files that shouldn't be indexed
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    // Other generated files
    "tsconfig.tsbuildinfo",
    ".next",
    "coverage",
    ".nyc_output"
  ];
  ig.add(defaultPatterns);

  const patterns = [...defaultPatterns];

  const ignoreFiles = [".gitignore", ".vibeignore"];
  for (const file of ignoreFiles) {
    const filePath = path.join(folderPath, file);
    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, "utf-8");
      ig.add(content);
      // Parse content to extract patterns for glob
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (trimmed && !trimmed.startsWith("#")) {
          // Convert gitignore pattern to glob pattern
          // Gitignore uses ** for matching, but we need to ensure proper format
          if (!trimmed.includes("/")) {
            // Pattern without slash applies everywhere
            patterns.push(`**/${trimmed}`);
          } else {
            patterns.push(trimmed);
          }
        }
      }
    }
  }

  return { filter: ig, patterns };
}

// Global state for progress tracking
export let indexingProgress = {
  active: false,
  projectName: "",
  totalFiles: 0,
  processedFiles: 0,
  failedFiles: 0,
  failedPaths: [],
  lastError: null,
  status: "idle",
  currentFiles: [],  // Currently processing files
  completedFiles: [], // Recently completed files (last 10)
  skippedFiles: 0     // Count of skipped (unchanged) files
};

let isShuttingDown = false;
let isPaused = false;

export function stopIndexing() {
  if (indexingProgress.active) {
    isShuttingDown = true;
    indexingProgress.status = "stopping";
    logger.info(`[Shutdown] Stopping indexing for "${indexingProgress.projectName}" gracefully...`);
  }
}

export function pauseIndexing(paused) {
  isPaused = paused;
  if (indexingProgress.active) {
    indexingProgress.status = paused ? "paused" : "indexing";
    logger.info(`[Indexing] ${paused ? "Paused" : "Resumed"} indexing for "${indexingProgress.projectName}".`);
  }
}

/**
 * Tool: index_folder
 * @param {boolean} summarize - Default is now TRUE for high accuracy
 * @param {boolean} background - If true, return immediately and index in background
 * @param {boolean} force - If true, clear existing index and re-scan everything
 */
export async function handleIndexFolder(folderPath, projectName, collection = "default", summarize = true, background = false, force = false) {
  const absolutePath = path.resolve(folderPath);
  const derivedProjectName = projectName || path.basename(absolutePath);

  if (indexingProgress.active) {
    return { content: [{ type: "text", text: `Error: An indexing task for "${indexingProgress.projectName}" is already in progress.` }], isError: true };
  }

  // 1. If force, clear the existing data for this project first
  if (force) {
    logger.info(`[Force Re-index] Clearing existing data for ${derivedProjectName}...`);
    await deleteProject(derivedProjectName);
  }

  const { filter: ig, patterns: ignorePatterns } = await getIgnoreFilter(absolutePath);

  // Convert patterns to glob-compatible format
  const globIgnorePatterns = ignorePatterns.map(p => {
    // If it already has **/, it's already formatted
    if (p.startsWith("**/")) {
      // For patterns like **/node_modules, add trailing /**
      if (!p.endsWith("/**") && !p.endsWith("*") && !p.includes(".")) {
        return p + "/**";
      }
      return p;
    }
    // For patterns with / (like dist/), treat as directory
    if (p.includes("/")) {
      if (!p.endsWith("/**") && !p.endsWith("*")) {
        return "**/" + p + "/**";
      }
      return "**/" + p;
    }
    // For file patterns (contains . or specific file extension), don't add /**
    if (p.includes(".") || p === "node_modules" || p === "dist" || p === "build") {
      return "**/" + p;
    }
    // For directory patterns without /, add /**
    return "**/" + p + "/**";
  });

  // Get all potential files - use .gitignore patterns during traversal to prevent EMFILE errors
  const allFiles = await glob("**/*.{ts,js,md,py,go,dart,java,kt,kts,json,toml,xml,html,svg}", {
    cwd: absolutePath,
    dot: true,
    nodir: true,
    ignore: {
      // Use patterns from .gitignore/.vibeignore during file system traversal
      child: globIgnorePatterns
    },
    maxDepth: 30 // Limit traversal depth
  });

  // Filter files using ignore patterns (double-check with gitignore instance)
  const filesOnDisk = allFiles.filter(file => !ig.ignores(file));
  const absoluteFilesOnDisk = new Set(filesOnDisk.map(f => path.join(absolutePath, f)));

  if (indexingProgress.active) {
    return { content: [{ type: "text", text: `Error: An indexing task for "${indexingProgress.projectName}" is already in progress.` }], isError: true };
  }

  isShuttingDown = false;
  isPaused = false;

  // Update progress state
  indexingProgress = {
    active: true,
    projectName: derivedProjectName,
    collection,
    totalFiles: filesOnDisk.length,
    processedFiles: 0,
    failedFiles: 0,
    failedPaths: [],
    lastError: null,
    status: "indexing",
    currentFiles: [],
    completedFiles: [],
    skippedFiles: 0
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

      const processFile = async (file, attempt = 1) => {
        if (isShuttingDown) return;

        // Wait if paused
        while (isPaused && !isShuttingDown) {
          await new Promise(r => setTimeout(r, 500));
        }

        const filePath = path.join(absolutePath, file);

        // Track that we're processing this file
        indexingProgress.currentFiles.push(file);

        try {
          const content = await fs.readFile(filePath, "utf-8");
          const hash = crypto.createHash("md5").update(content).digest("hex");
          const existingHash = await getFileHash(filePath);

          if (existingHash === hash) {
            skipped++;
            indexingProgress.skippedFiles++;
            indexingProgress.processedFiles++;

            // Remove from currentFiles and add to completed
            indexingProgress.currentFiles = indexingProgress.currentFiles.filter(f => f !== file);
            indexingProgress.completedFiles.unshift({ file, status: "skipped" });
            if (indexingProgress.completedFiles.length > 20) indexingProgress.completedFiles.pop();

            return;
          }

          if (existingHash) await deleteFileData(filePath);

          const { blocks, metadata } = await extractCodeBlocks(filePath);
          await updateDependencies(filePath, derivedProjectName, collection, metadata);

          // Get file type configuration to determine if/how to summarize
          const fileTypeConfig = await getFileTypeConfig(filePath);

          // Skip files marked as "index: false" (like lock files)
          if (fileTypeConfig.index === false) {
            logger.info(`[Index] Skipping ${file} (file type '${fileTypeConfig.typeName}' is configured to not index)`);
            return;
          }

          if (blocks.length > 0) {
            const parentSummaries = new Map();
            const shouldSummarize = summarize && fileTypeConfig.summarize !== false;

            if (shouldSummarize) {
              const parents = blocks.filter(b => b.type !== "chunk");
              for (const parent of parents) {
                if (isShuttingDown) break;
                // Wait if paused during summarization
                while (isPaused && !isShuttingDown) {
                  await new Promise(r => setTimeout(r, 500));
                }

                // Truncate content if maxLength is specified (for large docs)
                let contentToSummarize = parent.content;
                if (fileTypeConfig.maxLength && contentToSummarize.length > fileTypeConfig.maxLength) {
                  contentToSummarize = contentToSummarize.substring(0, fileTypeConfig.maxLength) + "\n\n... (truncated)";
                }

                // Use the configured prompt template
                const promptTemplate = fileTypeConfig.promptTemplate || "summarize";
                try {
                  const summary = await summarizerManager.summarize(contentToSummarize, {
                    fileName: file,
                    projectName: derivedProjectName,
                    promptTemplate,
                    sectionName: parent.name.replace("Doc: ", "")
                  });
                  parentSummaries.set(parent.name, summary);
                } catch (summaryErr) {
                  logger.error(`[Index] Summarization failed for ${file} [${parent.name}]: ${summaryErr.message}`);
                  parentSummaries.set(parent.name, ""); // Continue with empty summary
                }
              }
            }

            // Prepare all texts to embed (batch optimization)
            const textsToEmbed = [];
            const blockData = [];

            for (const block of blocks) {
              if (isShuttingDown) break;

              let summary = "";
              if (shouldSummarize) {
                try {
                  summary = block.type === "chunk"
                    ? await summarizerManager.summarize(block.content, {
                      fileName: file,
                      projectName: derivedProjectName,
                      type: 'chunk',
                      parentName: block.parentName,
                      promptTemplate: fileTypeConfig.promptTemplate || 'summarize'
                    })
                    : parentSummaries.get(block.name) || "";
                } catch (summaryErr) {
                  logger.error(`[Index] Summarization failed for block ${block.name} in ${file}: ${summaryErr.message}`);
                  summary = "";
                }
              }

              const contextPrefix = summary ? `Context: ${summary}\n\n` : "";
              const textToEmbed = `Category: ${block.category}\nCollection: ${collection}\nProject: ${derivedProjectName}\nFile: ${file}\nType: ${block.type}\nName: ${block.name}\nComments: ${block.comments}\nCode: ${contextPrefix}${block.content.substring(0, 500)}`;

              textsToEmbed.push(textToEmbed);
              blockData.push({
                collection,
                projectname: derivedProjectName,
                name: block.name,
                type: block.type,
                category: block.category || (file.endsWith('.md') ? 'documentation' : 'code'),
                filepath: filePath,
                startline: block.startLine,
                endline: block.endLine,
                comments: block.comments,
                content: block.content,
                summary
              });
            }

            // Wait if paused before batch embedding
            while (isPaused && !isShuttingDown) {
              await new Promise(r => setTimeout(r, 500));
            }

            // Generate embeddings in batch (much faster!)
            const vectors = isShuttingDown ? [] : await embeddingManager.generateEmbeddingsBatch(textsToEmbed);

            // Combine vectors with block data
            const dataToInsert = blockData.map((data, i) => ({
              ...data,
              vector: vectors[i]
            }));
            if (!isShuttingDown) {
              await createOrUpdateTable(dataToInsert, embeddingManager.getModel());
              totalIndexed += blocks.length;
            }
          }
          hashUpdates.push({ filePath, hash });
          indexingProgress.processedFiles++;

          // Remove from currentFiles and add to completed
          indexingProgress.currentFiles = indexingProgress.currentFiles.filter(f => f !== file);
          indexingProgress.completedFiles.unshift({ file, status: "completed", blocks: blocks.length });
          if (indexingProgress.completedFiles.length > 20) indexingProgress.completedFiles.pop();

        } catch (err) {
          if (attempt < 3 && !isShuttingDown) {
            logger.warn(`[Retry] Processing ${file} failed (attempt ${attempt}/3): ${err.message}. Retrying...`);
            // Clean up currentFiles before retrying to avoid duplicates in display
            indexingProgress.currentFiles = indexingProgress.currentFiles.filter(f => f !== file);
            // Exponential backoff
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
            return processFile(file, attempt + 1);
          }

          logger.error(`Error processing ${file} after 3 attempts: ${err.message}`);
          indexingProgress.failedFiles++;
          indexingProgress.processedFiles++;
          indexingProgress.failedPaths.push(filePath);
          indexingProgress.lastError = err.message;

          // Remove from currentFiles and add to completed as failed
          indexingProgress.currentFiles = indexingProgress.currentFiles.filter(f => f !== file);
          indexingProgress.completedFiles.unshift({ file, status: "failed", error: err.message });
          if (indexingProgress.completedFiles.length > 20) indexingProgress.completedFiles.pop();
        }
      };

      const workers = new Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
        while (queue.length > 0 && !isShuttingDown) {
          const file = queue.shift();
          if (file) await processFile(file);
        }
      });

      await Promise.all(workers);
      if (hashUpdates.length > 0) await bulkUpdateFileHashes(hashUpdates);

      indexingProgress.active = false;
      if (isShuttingDown) {
        indexingProgress.status = "stopped";
        logger.info(`[Shutdown] Indexing for "${derivedProjectName}" stopped gracefully.`);
      } else {
        if (indexingProgress.failedFiles > 0) {
          indexingProgress.status = "completed_with_errors";
          logger.warn(`[Success] Indexing complete for "${derivedProjectName}" with ${indexingProgress.failedFiles} errors.`);
        } else {
          indexingProgress.status = "completed";
          logger.info(`[Success] Indexing complete for "${derivedProjectName}". Indexed: ${totalIndexed} blocks, Skipped: ${skipped}, Pruned: ${pruned}.`);
        }
      }

      return { totalIndexed, skipped, pruned };
    } catch (err) {
      indexingProgress.active = false;
      indexingProgress.status = `error: ${err.message}`;
      indexingProgress.lastError = err.message;
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
 * Shared search logic that returns raw result objects
 */
export async function searchCode(query, collection, projectName, fileTypes, categories) {
  const currentModel = embeddingManager.getModel();
  const storedModel = await getStoredModel();

  if (storedModel && storedModel !== currentModel) {
    logger.info(`[Auto-Switch] Switching model from "${currentModel}" to stored model "${storedModel}" to match index.`);
    await embeddingManager.setModel(storedModel);
  }

  const queryVector = await embeddingManager.generateEmbedding(query);
  const rawResults = await hybridSearch(query, queryVector, { collection, projectName, fileTypes, categories, limit: 15 });
  return await rerankerManager.rerank(query, rawResults, 10);
}

/**
 * Tool: search_code (MCP Wrapper)
 */
export async function handleSearchCode(query, collection, projectName, categories = ['code']) {
  const results = await searchCode(query, collection, projectName, undefined, categories);

  const formattedResults = results.map(r =>
    `[Score: ${r.rerankScore.toFixed(4)}] [Project: ${r.projectname}] [Category: ${r.category}]
File: ${r.filepath} (${r.startline}-${r.endline})
Summary: ${r.summary || "N/A"}
---
`
  ).join("\n\n");

  return { content: [{ type: "text", text: formattedResults || "No matches found." }] };
}

/**
 * RAG-based Chat Logic
 */
export async function chatWithCode(query, collection, projectName, history = [], fileTypes, categories) {
  const results = await searchCode(query, collection, projectName, fileTypes, categories);

  if (results.length === 0 && history.length === 0) {
    return "I couldn't find any relevant code to answer your question.";
  }

  // Format context for the LLM
  const context = results.map(r =>
    `File: ${r.filepath}\nProject: ${r.projectname}\nCode:\n${r.content}`
  ).join("\n\n---\n\n");

  return await summarizerManager.generateResponse(query, context, history);
}

/**
 * Helper to open file in default editor/browser
 * Supports line numbers if provided (e.g. for VS Code/Cursor)
 */
export async function openFile(filePath, line = 1) {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      // Try to use 'code' command if available for better experience
      try {
        await execAsync(`code --goto "${filePath}:${line}"`);
        return;
      } catch {
        await execAsync(`open "${filePath}"`);
      }
    } else if (platform === "win32") {
      try {
        await execAsync(`code --goto "${filePath}:${line}"`);
        return;
      } catch {
        await execAsync(`start "" "${filePath}"`);
      }
    } else {
      await execAsync(`xdg-open "${filePath}"`);
    }
  } catch (err) {
    logger.error(`Failed to open file: ${err.message}`);
  }
}

export async function indexSingleFile(filePath, projectName, collection, summarize = true) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const hash = crypto.createHash("md5").update(content).digest("hex");
    const existingHash = await getFileHash(filePath);
    if (existingHash === hash) return;
    if (existingHash) await deleteFileData(filePath);

    const { blocks, metadata } = await extractCodeBlocks(filePath);
    await updateDependencies(filePath, projectName, collection, metadata);

    if (blocks.length > 0) {
      let parentSummaries = new Map();

      // Pre-summarize for hierarchical context (only if summarize is enabled)
      if (summarize) {
        for (const parent of blocks.filter(b => b.type !== "chunk")) {
          parentSummaries.set(parent.name, await summarizerManager.summarize(parent.content, {
            fileName: path.basename(filePath),
            projectName
          }));
        }
      }

      const dataToInsert = [];
      for (const block of blocks) {
        const summary = summarize
          ? (block.type === "chunk"
            ? await summarizerManager.summarize(block.content, { fileName: path.basename(filePath), projectName, type: "chunk", parentName: block.parentName })
            : parentSummaries.get(block.name) || "")
          : "";

        const contextPrefix = summary ? `Context: ${summary}\n\n` : "";
        const textToEmbed = `Category: ${block.category}\nCollection: ${collection}\nProject: ${projectName}\nFile: ${path.basename(filePath)}\nSummary: ${summary}\nCode: ${contextPrefix}${block.content.substring(0, 500)}`;
        dataToInsert.push({
          vector: null,
          textToEmbed,
          collection,
          projectname: projectName,
          name: block.name,
          type: block.type,
          category: block.category || (filePath.endsWith(".md") ? "documentation" : "code"),
          filepath: filePath,
          startline: block.startLine,
          endline: block.endLine,
          comments: block.comments,
          content: block.content,
          summary
        });
      }

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
