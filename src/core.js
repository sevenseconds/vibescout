import { glob } from "glob";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import ignore from "ignore";
import { EventEmitter } from "events";
import { extractCodeBlocks } from "./extractor.js";
import { embeddingManager, rerankerManager, summarizerManager } from "./embeddings.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import { initGitRepo, batchCollectGitInfo } from "./git-info.js";
import { profileStart, profileEnd, profileAsync } from "./profiler-api.js";
import {
  createOrUpdateTable,
  hybridSearch,
  getStoredModel,
  getFileHash,
  getFileMetadata,
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

export const indexingEvents = new EventEmitter();

const CONCURRENCY_LIMIT = 8;

/**
 * Simple token counter for indexing
 */
function countTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Get file type configuration for a given file path
 */
async function getFileTypeConfig(filePath) {
  const config = await loadConfig();
  const fileTypes = config.fileTypes || {};

  for (const [typeName, typeConfig] of Object.entries(fileTypes)) {
    if (typeConfig.extensions) {
      for (const ext of typeConfig.extensions) {
        if (ext.startsWith(".")) {
          if (filePath.endsWith(ext)) {
            return { typeName, ...typeConfig };
          }
        } else {
          if (filePath.endsWith("/" + ext) || filePath.endsWith("//" + ext) || filePath === ext) {
            return { typeName, ...typeConfig };
          }
        }
      }
    }
  }

  return {
    typeName: "code",
    summarize: true,
    chunking: "headings",
    promptTemplate: "summarize",
    description: "Unknown file type"
  };
}

/**
 * Helper to load ignore patterns
 */
async function getIgnoreFilter(folderPath) {
  const ig = ignore();
  const defaultPatterns = [
    ".git", "node_modules", "dist", ".lancedb", ".lancedb_test", ".vibescout",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
    "tsconfig.tsbuildinfo", ".next", "coverage", ".nyc_output"
  ];
  ig.add(defaultPatterns);
  const patterns = [...defaultPatterns];

  const ignoreFiles = [
    ".gitignore", ".vibeignore", ".vibescoutignore", ".cursorignore",
    ".cursorindexingignore", ".copilotignore", ".geminiignore", ".aicodeignore"
  ];
  for (const file of ignoreFiles) {
    const filePath = path.join(folderPath, file);
    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, "utf-8");
      ig.add(content);
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          if (!trimmed.includes("/")) patterns.push(`**/${trimmed}`);
          else patterns.push(trimmed);
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
  currentFiles: [],
  completedFiles: [],
  skippedFiles: 0
};

/**
 * Emit current indexing status to all listeners
 */
function emitStatus() {
  indexingEvents.emit("status", indexingProgress);
}

let isShuttingDown = false;
let isPaused = false;

export function resetIndexingProgress() {
  indexingProgress = {
    active: false, projectName: "", totalFiles: 0, processedFiles: 0,
    failedFiles: 0, failedPaths: [], lastError: null, status: "idle",
    currentFiles: [], completedFiles: [], skippedFiles: 0
  };
  logger.info("[Indexing] Progress state reset");
  emitStatus();
}

export function stopIndexing() {
  if (indexingProgress.active) {
    isShuttingDown = true;
    indexingProgress.status = "stopping";
    logger.info(`[Shutdown] Stopping indexing gracefully...`);
    emitStatus();
  }
}

export function pauseIndexing(paused) {
  isPaused = paused;
  if (indexingProgress.active) {
    indexingProgress.status = paused ? "paused" : "indexing";
    emitStatus();
  }
}

/**
 * Main entry point for folder indexing
 */
export async function handleIndexFolder(folderPath, projectName, collection = "default", summarize = true, background = false, force = false, task = null) {
  profileStart("index_folder", { folderPath, projectName, collection });

  const config = await loadConfig();
  const absolutePath = path.resolve(folderPath);
  const derivedProjectName = projectName || path.basename(absolutePath);

  if (indexingProgress.active && !background) {
    profileEnd("index_folder", { status: "error", error: "Already indexing" });
    return { content: [{ type: "text", text: `Error: An indexing task for "${indexingProgress.projectName}" is already in progress.` }], isError: true };
  }

  // 1. If force, clear the existing data for this project first
  if (force) {
    logger.info(`[Force Re-index] Clearing data for ${derivedProjectName}...`);
    await deleteProject(derivedProjectName);
  }

  const { filter: ig, patterns: ignorePatterns } = await getIgnoreFilter(absolutePath);
  const globIgnorePatterns = ignorePatterns.map(p => {
    if (p.startsWith("**/")) return p.endsWith("/") ? p + "**" : p;
    return "**/" + p + (p.includes(".") ? "" : "/**");
  });

  const allFiles = await glob("**/*.{ts,js,md,py,go,dart,java,kt,kts,json,toml,xml,html}", {
    cwd: absolutePath, dot: true, nodir: true, ignore: globIgnorePatterns, maxDepth: 30
  });

  const filesOnDisk = allFiles.filter(file => !ig.ignores(file));
  const absoluteFilesOnDisk = new Set(filesOnDisk.map(f => path.join(absolutePath, f)));

  isShuttingDown = false;
  isPaused = false;

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
  emitStatus();

  if (task) {
    task.progress.totalFiles = filesOnDisk.length;
    task.projectName = derivedProjectName;
  }

  const gitConfig = config.gitIntegration || { enabled: true, embedInVector: true };
  const gitRepoPath = gitConfig.enabled ? await initGitRepo(absolutePath) : null;

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

      // 2. Fast Pass Change Detection
      const changedFiles = [];
      const fileMetadataMap = new Map();

      for (const file of filesOnDisk) {
        const filePath = path.join(absolutePath, file);
        try {
          const stats = await fs.stat(filePath);
          const metadata = await getFileMetadata(filePath);
          const mtime = stats.mtimeMs;
          const size = stats.size;
          
          fileMetadataMap.set(filePath, { mtime, size, hash: metadata.file_hash });

          if (metadata.last_mtime !== mtime || metadata.last_size !== size || !metadata.file_hash) {
            changedFiles.push(filePath);
          }
        } catch {
          changedFiles.push(filePath);
        }
      }

      // 3. Batch Git Info for changed files
      let gitInfoMap = new Map();
      if (gitRepoPath && gitConfig.enabled && changedFiles.length > 0) {
        gitInfoMap = await batchCollectGitInfo(gitRepoPath, changedFiles, gitConfig.churnWindow || 6);
      }

      const queue = [...filesOnDisk];
      const processFile = async (file, attempt = 1) => {
        if (isShuttingDown) return;
        if (task && task.cancelRequested) {
          indexingProgress.active = false;
          indexingProgress.status = "cancelled";
          emitStatus();
          return;
        }

        while (isPaused && !isShuttingDown) await new Promise(r => setTimeout(r, 500));

        const filePath = path.join(absolutePath, file);
        if (!filePath || typeof filePath !== 'string') {
          logger.error(`[Index] Invalid file path: ${filePath}`);
          indexingProgress.processedFiles++;
          return;
        }

        const preMetadata = fileMetadataMap.get(filePath);

        // Fast skip using mtime/size
        if (!changedFiles.includes(filePath) && preMetadata?.hash) {
          skipped++;
          indexingProgress.skippedFiles++;
          indexingProgress.processedFiles++;
          if (task) task.progress.processedFiles++;
          emitStatus();
          return;
        }

        indexingProgress.currentFiles.push(file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const hash = crypto.createHash("md5").update(content).digest("hex");

          // Final skip using hash (file was touched but content same)
          if (preMetadata?.hash === hash) {
            skipped++;
            indexingProgress.skippedFiles++;
            indexingProgress.processedFiles++;
            if (task) task.progress.processedFiles++;
            indexingProgress.currentFiles = indexingProgress.currentFiles.filter(f => f !== file);
            emitStatus();
            return;
          }

          if (preMetadata?.hash) await deleteFileData(filePath);

          const fileTypeConfig = await getFileTypeConfig(filePath);
          if (fileTypeConfig.index === false) {
            indexingProgress.currentFiles = indexingProgress.currentFiles.filter(f => f !== file);
            indexingProgress.processedFiles++;
            emitStatus();
            return;
          }

          const { blocks, metadata } = await extractCodeBlocks(filePath, {
            chunking: fileTypeConfig.chunking,
            code: content 
          });
          await updateDependencies(filePath, derivedProjectName, collection, metadata);

          if (blocks && blocks.length > 0) {
            const parentSummaries = new Map();
            const shouldSummarize = summarize && fileTypeConfig.summarize !== false;

            if (shouldSummarize) {
              const parents = blocks.filter(b => b.type !== "chunk");
              for (const parent of parents) {
                if (isShuttingDown) break;
                try {
                  const summary = await summarizerManager.summarize(parent.content.substring(0, fileTypeConfig.maxLength || 3000), {
                    fileName: file, projectName: derivedProjectName, promptTemplate: fileTypeConfig.promptTemplate,
                    sectionName: parent.name.replace("Doc: ", "")
                  });
                  parentSummaries.set(parent.name, summary);
                } catch (sumErr) {
                  logger.warn(`[Index] Summarization failed for ${file} : ${sumErr.message}`);
                }
              }
            }

            const blockData = [];
            for (const block of blocks) {
              if (isShuttingDown) break;
              let summary = "";
              if (shouldSummarize) {
                summary = block.type === "chunk" 
                  ? await summarizerManager.summarize(block.content, { fileName: file, projectName: derivedProjectName, type: "chunk", parentName: block.parentName })
                  : parentSummaries.get(block.name) || "";
              }

              const gitInfo = gitInfoMap.get(filePath);
              let gitContext = "";
              if (gitInfo && gitConfig.embedInVector) {
                gitContext = `Last Modified: ${new Date(gitInfo.date).toLocaleDateString()} by ${gitInfo.author}\nChurn: ${gitInfo.churnLevel}\n`;
              }

              const textToEmbed = `Category: ${block.category}\nProject: ${derivedProjectName}\nFile: ${file}\nType: ${block.type}\nName: ${block.name}\n${gitContext}Code: ${summary ? "Context: "+summary+"\n" : ""}${block.content.substring(0, 500)}`;

              blockData.push({
                collection, projectname: derivedProjectName, name: block.name, type: block.type,
                category: block.category || (file.endsWith(".md") ? "documentation" : "code"),
                filepath: filePath, startline: block.startLine, endline: block.endLine,
                comments: block.comments, content: block.content, summary,
                last_commit_author: gitInfo?.author, last_commit_email: gitInfo?.email,
                last_commit_date: gitInfo?.date, last_commit_hash: gitInfo?.hash,
                last_commit_message: gitInfo?.message, commit_count_6m: gitInfo?.commitCount6m,
                churn_level: gitInfo?.churnLevel, file_hash: hash,
                last_mtime: preMetadata?.mtime, last_size: preMetadata?.size,
                token_count: countTokens(block.content),
                textToEmbed
              });
            }

            if (blockData.length > 0 && !isShuttingDown) {
              const vectors = await embeddingManager.generateEmbeddingsBatch(blockData.map(b => b.textToEmbed));
              const dataToInsert = blockData.map((d, i) => {
                const { textToEmbed, ...rest } = d;
                return { ...rest, vector: vectors[i] };
              });
              await createOrUpdateTable(dataToInsert, embeddingManager.getModel());
              totalIndexed += blocks.length;
            }
          }
          indexingProgress.processedFiles++;
          if (task) task.progress.processedFiles++;
          indexingProgress.currentFiles = indexingProgress.currentFiles.filter(f => f !== file);
          indexingProgress.completedFiles.unshift({ file, status: "completed", blocks: blocks.length });
          if (indexingProgress.completedFiles.length > 20) indexingProgress.completedFiles.pop();
          emitStatus();
        } catch (err) {
          if (attempt < 3 && !isShuttingDown) return processFile(file, attempt + 1);
          logger.error(`[Index] Critical error processing file "${file}": ${err.message}`, {
            path: filePath, stack: err.stack, attempt
          });
          indexingProgress.failedFiles++;
          indexingProgress.processedFiles++;
          indexingProgress.failedPaths.push(filePath);
          if (task) { task.progress.failedFiles++; task.progress.processedFiles++; task.failedPaths.push(filePath); }
          indexingProgress.currentFiles = indexingProgress.currentFiles.filter(f => f !== file);
          emitStatus();
        }
      };

      const workers = new Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
        while (queue.length > 0 && !isShuttingDown) {
          const file = queue.shift();
          if (file) { 
            await processFile(file); 
            await new Promise(r => setTimeout(r, 10)); 
          }
        }
      });
      await Promise.all(workers);

      indexingProgress.active = false;
      indexingProgress.status = isShuttingDown ? "stopped" : (indexingProgress.failedFiles > 0 ? "completed_with_errors" : "completed");
      logger.info(`[Success] Indexing complete for "${derivedProjectName}". Indexed: ${totalIndexed}, Skipped: ${skipped}, Pruned: ${pruned}.`);
      emitStatus();
      return { totalIndexed, skipped, pruned };
    } catch (err) {
      indexingProgress.active = false;
      indexingProgress.status = "error";
      indexingProgress.lastError = err.message;
      emitStatus();
      throw err;
    }
  };

  if (background) {
    runIndexing().catch(console.error);
    return { content: [{ type: "text", text: `Started background indexing for "${derivedProjectName}".` }] };
  } else {
    const result = await runIndexing();
    return { content: [{ type: "text", text: `Sync complete. Indexed: ${result.totalIndexed}, Skipped: ${result.skipped}, Pruned: ${result.pruned}.` }] };
  }
}

export async function searchCode(query, collection, projectName, fileTypes, categories, authors, dateFrom, dateTo, churnLevels, minScore = 0.4, limit = 10) {
  try {
    const storedModel = await getStoredModel();
    if (storedModel && storedModel !== embeddingManager.getModel()) await embeddingManager.setModel(storedModel);

    const queryVector = await embeddingManager.generateEmbedding(query);
    const rawResults = await hybridSearch(query, queryVector, {
      collection, projectName, fileTypes, categories, limit, authors, dateFrom, dateTo, churnLevels
    });

    const reranked = await rerankerManager.rerank(query, rawResults, limit);
    return reranked.filter(r => (r.rerankScore || r.score || 0) >= minScore);
  } catch (error) { throw error; }
}

export async function handleSearchCode(query, collection, projectName, categories = ["code"], fileTypes, authors, dateFrom, dateTo, churnLevels, minScore, limit, previewOnly = false) {
  const results = await searchCode(query, collection, projectName, fileTypes, categories, authors, dateFrom, dateTo, churnLevels, minScore, limit);
  if (previewOnly) {
    const totalTokens = results.reduce((sum, r) => sum + (r.token_count || 0), 0);
    return { content: [{ type: "text", text: `# Search Preview for: "${query}"\nTokens: ${totalTokens}` }] };
  }

  const formattedResults = results.map((r, idx) => `## Result ${idx + 1}\nFile: ${r.filepath}\nScore: ${r.rerankScore.toFixed(4)}\n\n${r.content}\n---`).join("\n\n");
  return { content: [{ type: "text", text: `# Search Results for: "${query}"\n\n${formattedResults}` }] };
}

export async function chatWithCode(query, collection, projectName, history = [], fileTypes, categories) {
  const results = await searchCode(query, collection, projectName, fileTypes, categories);
  const context = results.map(r => `File: ${r.filepath}\nCode:\n${r.content}`).join("\n\n---\n\n");
  return await summarizerManager.generateResponse(query, context, history);
}

export async function openFile(filePath, line = 1) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? `code --goto "${filePath}:${line}" || open "${filePath}"` : (platform === "win32" ? `code --goto "${filePath}:${line}" || start "" "${filePath}"` : `xdg-open "${filePath}"`);
  try { await execAsync(cmd); } catch (err) { logger.error(`Failed to open file: ${err.message}`); }
}

export async function indexSingleFile(filePath, projectName, collection, summarize = true) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const hash = crypto.createHash("md5").update(content).digest("hex");
    const metadata = await getFileMetadata(filePath);
    if (metadata.file_hash === hash) return;
    if (metadata.file_hash) await deleteFileData(filePath);

    const { blocks, metadata: extractedMetadata } = await extractCodeBlocks(filePath, { code: content });
    await updateDependencies(filePath, projectName, collection, extractedMetadata);

    if (blocks && blocks.length > 0) {
      const dataToInsert = [];
      for (const block of blocks) {
        const textToEmbed = `File: ${path.basename(filePath)}\nCode: ${block.content.substring(0, 500)}`;
        const vector = await embeddingManager.generateEmbedding(textToEmbed);
        dataToInsert.push({
          vector, collection, projectname: projectName, name: block.name, type: block.type,
          category: block.category || (filePath.endsWith(".md") ? "documentation" : "code"),
          filepath: filePath, startline: block.startLine, endline: block.endLine,
          comments: block.comments, content: block.content, file_hash: hash,
          token_count: countTokens(block.content)
        });
      }
      await createOrUpdateTable(dataToInsert, embeddingManager.getModel());
    }
  } catch (err) { logger.error(`[Watcher] Error: ${err.message}`); }
}