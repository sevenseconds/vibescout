import chokidar from "chokidar";
import path from "path";
import ignore from "ignore";
import fs from "fs-extra";
import { logger } from "./logger.js";
import { handleIndexFolder, indexSingleFile } from "./core.js";
import { getWatchList, deleteFileData, addToWatchList, removeFromWatchList } from "./db.js";
import { loadConfig } from "./config.js";
import { glob } from "glob";
import { getTaskQueue, TaskType, TaskPriority } from "./task-queue.js";

// EMFILE-safe file count check - stops early to avoid hitting limits
async function countFilesRecursively(dirPath: string, maxFiles: number = 3000): Promise<number> {
  try {
    // Get ignore patterns for this directory (formatted for glob/chokidar)
    const ignorePatterns = await getIgnorePatterns(dirPath);

    const files = await glob('**/*', {
      cwd: dirPath,
      nodir: true,
      absolute: false,
      maxDepth: 10, // Shallow depth to avoid scanning too deep
      ignore: ignorePatterns // Glob's ignore option accepts minimatch patterns
    });

    return files.length;
  } catch (err) {
    // If glob fails (likely EMFILE), assume it's a large project
    logger.debug(`[Watcher] File count failed: ${(err as any).message}, assuming large project`);
    return maxFiles + 1;
  }
}

/**
 * Helper to load ignore patterns from .vibeignore and .gitignore for a specific folder
 */
async function getIgnorePatterns(folderPath: string): Promise<string[]> {
  const defaultPatterns = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.vibescout/**",
    "**/.lancedb/**",
    "**/.lancedb_test/**",
    // Lock files
    "**/package-lock.json",
    "**/yarn.lock",
    "**/pnpm-lock.yaml",
    "**/bun.lockb",
    // Other generated files
    "**/tsconfig.tsbuildinfo",
    "**/.nyc_output"
  ];

  const patterns = [...defaultPatterns];

  const ignoreFiles = [
    // Standard version control
    ".gitignore",
    // VibeScout specific
    ".vibeignore",
    ".vibescoutignore",
    // AI editor ignore files
    ".cursorignore",
    ".cursorindexingignore",
    ".copilotignore",
    ".geminiignore",
    ".aicodeignore"
  ];
  for (const file of ignoreFiles) {
    const filePath = path.join(folderPath, file);
    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, "utf-8");
      const ig = ignore();
      ig.add(content);

      // Parse content to extract patterns for watcher
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (trimmed && !trimmed.startsWith('#')) {
          // Convert gitignore pattern to chokidar pattern
          let pattern = trimmed;

          // Remove trailing slash if present for consistent processing
          if (pattern.endsWith('/')) {
            pattern = pattern.slice(0, -1);
          }

          // Ensure pattern starts with **/ for chokidar
          if (!pattern.startsWith('**/') && !pattern.startsWith('*') && !pattern.startsWith('/')) {
            pattern = '**/' + pattern;
          }

          // Add patterns for both the directory and its contents
          // For directories, add both pattern and pattern/**
          if (!pattern.includes('*') && !pattern.includes('.') && !pattern.endsWith('/')) {
            // This is likely a directory name without extension (e.g., node_modules, build)
            patterns.push(pattern);       // Match the directory itself
            patterns.push(pattern + '/**'); // Match contents
          } else {
            // Pattern already has wildcard or extension, use as-is
            // For dot directories like .git, also add the directory-wide pattern
            if (pattern.startsWith('.') || pattern.includes('/.')) {
              patterns.push(pattern);       // Match the directory/file itself
              patterns.push(pattern + '/**'); // Match contents
            } else {
              patterns.push(pattern);
            }
          }
        }
      }
    }
  }

  return patterns;
}

const watchers = new Map<string, any>();
const debounceTimers = new Map<string, NodeJS.Timeout>();
const emfileWarned = new Set<string>(); // Track projects that already logged EMFILE warning

export async function initWatcher(force = false) {
  const watchList = await getWatchList();
  logger.info(`Initializing persistent watchers for ${watchList.length} projects...`);

  // Pre-check: Count files across ALL projects to determine if we need polling mode
  // EMFILE limit is system-wide, not per-project, so we must account for all projects
  let usePollingMode = process.env.USE_POLLING === "true";
  const EMFILE_THRESHOLD = 500; // Very conservative to prevent EMFILE spam (reduced from 1000)

  if (!usePollingMode) {
    try {
      let totalFiles = 0;
      for (const item of watchList) {
        const absolutePath = path.resolve(item.folderpath);
        const count = await countFilesRecursively(absolutePath);
        totalFiles += count;
        logger.info(`[Watcher] Project "${item.projectname}" has ${count} files`);
        if (totalFiles > EMFILE_THRESHOLD) {
          logger.info(`[Watcher] Total files across all projects: ${totalFiles} (threshold: ${EMFILE_THRESHOLD}), using polling mode to prevent EMFILE errors`);
          usePollingMode = true;
          break;
        }
      }
      if (!usePollingMode) {
        logger.info(`[Watcher] Total files across all projects: ${totalFiles}, using native events`);
      }
    } catch (err: any) {
      logger.warn(`[Watcher] Could not count files (${err.message}), defaulting to polling mode`);
      usePollingMode = true;
    }
  }

  // Now start all watchers with the determined mode
  for (const item of watchList) {
    try {
      await startWatching(item.folderpath, item.projectname, item.collection, force, usePollingMode);
    } catch (err: any) {
      logger.error(`Failed to start watcher for ${item.folderpath}: ${err.message}`);
    }
  }
}

async function startWatching(
  folderPath: string,
  projectName: string,
  collection: string,
  force = false,
  globalPollingMode?: boolean
) {
  const absolutePath = path.resolve(folderPath);
  if (watchers.has(absolutePath)) {
    logger.debug(`[Watcher] Already watching ${absolutePath}, skipping start.`);
    return;
  }

  // Read settings from config
  const config = await loadConfig();
  const shouldSummarize = config.summarize ?? true;

  // Determine watch paths based on config or auto-detect
  let watchPaths: string[];

  // Check if user has configured specific directories to watch
  if (config.watchDirectories && Array.isArray(config.watchDirectories) && config.watchDirectories.length > 0) {
    // Use configured directories
    watchPaths = [];
    for (const dir of config.watchDirectories) {
      const dirPath = path.join(absolutePath, dir);
      if (await fs.pathExists(dirPath)) {
        watchPaths.push(dirPath);
      }
    }

    // If none of the configured directories exist, fall back to root
    if (watchPaths.length === 0) {
      watchPaths = [absolutePath];
      logger.info(`[Watcher] No configured directories found for ${projectName}, watching root`);
    } else {
      logger.info(`[Watcher] Watching configured directories for ${projectName}: ${config.watchDirectories.join(', ')}`);
    }
  } else if (config.watchDirectories === null || config.watchDirectories === undefined || config.watchDirectories.length === 0) {
    // Explicitly set to empty/null means watch everything
    watchPaths = [absolutePath];
    logger.info(`[Watcher] Watching entire project for ${projectName}`);
  } else {
    // Auto-detect: watch src/ if it exists
    const srcPath = path.join(absolutePath, 'src');
    const hasSrcDirectory = await fs.pathExists(srcPath);

    if (hasSrcDirectory) {
      // Watch src/ directory + important root directories
      watchPaths = [
        srcPath,
        path.join(absolutePath, 'public'),
        path.join(absolutePath, 'app'),
        path.join(absolutePath, 'lib'),
        path.join(absolutePath, 'components'),
      ];
      // Filter to only include paths that exist
      watchPaths = await Promise.all(
        watchPaths.filter(async p => await fs.pathExists(p))
      );
      logger.info(`[Watcher] Auto-detected src/ for ${projectName}: watching key directories`);
    } else {
      // Fallback to watching root
      watchPaths = [absolutePath];
      logger.info(`[Watcher] No src/ directory found for ${projectName}, watching root`);
    }
  }

  // Get ignore patterns from .gitignore and .vibeignore
  const ignorePatterns = await getIgnorePatterns(absolutePath);

  // Add additional file-specific ignores
  const additionalIgnores = [
    "**/*.log",
    "**/.DS_Store",
    "**/tmp/**",
    "**/temp/**",
    "**/*.test.js",
    "**/*.test.ts",
    "**/*.spec.js",
    "**/*.spec.ts",
    "**/.vscode/**",
    "**/.idea/**",
    // Images
    "**/*.png",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.gif",
    "**/*.bmp",
    "**/*.webp",
    "**/*.ico",
    "**/*.tiff",
    "**/*.svg"
  ];

  const allPatterns = [...ignorePatterns, ...additionalIgnores];

  // Use the globally determined polling mode (from initWatcher), or fallback to env var
  let usePollingMode = globalPollingMode !== undefined ? globalPollingMode : process.env.USE_POLLING === "true";

  // Helper to create watcher with fallback to polling mode
  const createWatcher = async (usePolling: boolean) => {
    const config = {
      ignored: allPatterns,
      persistent: true,
      ignoreInitial: true,
      usePolling,
      interval: usePolling ? 1000 : 2000,
      binaryInterval: 1000,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      },
      depth: 10, // Reduced from 15 to prevent EMFILE on large projects
      atomic: false,
    };

    try {
      return chokidar.watch(watchPaths, config);
    } catch (err: any) {
      if (!usePolling && (err.message.includes('EMFILE') || err.message.includes('too many open files'))) {
        throw err; // Re-throw to trigger polling fallback
      }
      throw err;
    }
  };

  let watcher: chokidar.FSWatcher;

  try {
    // Use pre-determined mode (native or polling based on file count)
    watcher = await createWatcher(usePollingMode);
    logger.info(`[Watcher] Using ${usePollingMode ? 'polling' : 'native'} mode for ${projectName}`);
  } catch (err: any) {
    if (!usePollingMode && (err.message.includes('EMFILE') || err.message.includes('too many open files'))) {
      logger.warn(`[Watcher] EMFILE error for ${projectName} - automatically switching to polling mode`);
      // Retry with polling mode
      try {
        watcher = await createWatcher(true);
        logger.info(`[Watcher] ✅ Successfully switched to polling mode for ${projectName}`);
      } catch (pollErr: any) {
        logger.error(`[Watcher] Failed to create watcher even with polling: ${pollErr.message}`);
        throw pollErr;
      }
    } else {
      throw err;
    }
  }

  // Add error handler for watcher (for runtime errors)
  watcher.on("error", (error: any) => {
    if (error.message.includes("EMFILE") || error.message.includes("too many open files")) {
      // Only log once per project to avoid spamming
      if (!emfileWarned.has(projectName)) {
        logger.warn(`[Watcher] Runtime EMFILE error for ${projectName}. The watcher will continue with polling.`);
        emfileWarned.add(projectName);
      }
      // Don't close the watcher - let it recover
    } else {
      logger.error(`[Watcher] Error for ${projectName}: ${error.message}`);
    }
  });

  // Debounced indexing function (like nodemon does)
  const debouncedIndex = (filePath: string) => {
    // Clear any existing timer for this file
    const existingTimer = debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set a new timer (wait 500ms after last change before indexing)
    const timer = setTimeout(async () => {
      logger.debug(`[Watcher] Queuing index for: ${filePath}`);

      // Queue the file indexing task with MEDIUM priority (higher than API requests)
      const queue = await getTaskQueue();
      queue.addTask(TaskType.INDEX_FILES, {
        filePaths: [filePath],
        projectName,
        collection,
        summarize: shouldSummarize
      }, TaskPriority.MEDIUM);

      debounceTimers.delete(filePath);
    }, 500);

    debounceTimers.set(filePath, timer);
  };

  watcher.on("add", (f: string) => debouncedIndex(f))
    .on("change", (f: string) => debouncedIndex(f))
    .on("unlink", (f: string) => deleteFileData(f));

  watchers.set(absolutePath, watcher);
  const mode = watcher.options.usePolling ? 'polling' : 'native events';
  logger.info(`Started real-time watcher for: ${projectName} (${folderPath}) [mode: ${mode}]`);

  // Run an initial index in background (always index the full folder, not just watched paths)
  handleIndexFolder(folderPath, projectName, collection, shouldSummarize, true, force).catch(err => {
    logger.error(`Initial background index failed for ${folderPath}: ${err.message}`);
  });
}

export async function watchProject(folderPath: string, projectName: string, collection: string = "default") {
  await addToWatchList(folderPath, projectName, collection);

  // For a single project being added, we still need to check if we should use polling
  // Account for existing watchers (EMFILE is system-wide)
  let usePollingMode = process.env.USE_POLLING === "true";

  if (!usePollingMode) {
    try {
      // Count existing watched files
      let existingFiles = 0;
      for (const [existingPath] of watchers) {
        existingFiles += await countFilesRecursively(existingPath);
      }

      // Count new project files
      const newProjectFiles = await countFilesRecursively(path.resolve(folderPath));
      const total = existingFiles + newProjectFiles;

      const EMFILE_THRESHOLD = 500; // Very conservative to prevent EMFILE spam (reduced from 1000)
      if (total > EMFILE_THRESHOLD) {
        logger.info(`[Watcher] After adding "${projectName}": ${total} files total (threshold: ${EMFILE_THRESHOLD}), using polling mode`);
        usePollingMode = true;
      } else {
        logger.info(`[Watcher] After adding "${projectName}": ${total} files total, using native events`);
      }
    } catch (err: any) {
      logger.warn(`[Watcher] Could not count files (${err.message}), defaulting to polling mode`);
      usePollingMode = true;
    }
  }

  await startWatching(folderPath, projectName, collection, false, usePollingMode);

  // Trigger initial index - read from config
  const config = await loadConfig();
  const shouldSummarize = config.summarize ?? true;
  return handleIndexFolder(folderPath, projectName, collection, shouldSummarize, true);
}

export async function unwatchProject(folderPath: string, projectName?: string) {
  const absolutePath = path.resolve(folderPath);
  logger.info(`[Watcher] Stopping watcher for: ${absolutePath}`);

  const watcher = watchers.get(absolutePath);
  if (watcher) {
    try {
      await watcher.close();
      logger.info(`[Watcher] Closed chokidar instance for ${absolutePath}`);
    } catch (err: any) {
      logger.error(`[Watcher] Error closing instance for ${absolutePath}: ${err.message}`);
    }
    watchers.delete(absolutePath);
  } else {
    logger.debug(`[Watcher] No active watcher found for ${absolutePath} to close.`);
  }

  // Clear any pending debounce timers for this path
  for (const [filePath, timer] of debounceTimers.entries()) {
    if (filePath.startsWith(absolutePath)) {
      clearTimeout(timer);
      debounceTimers.delete(filePath);
    }
  }

  // Clear EMFILE warning flag so it can warn again if re-added
  emfileWarned.delete(projectName || path.basename(absolutePath));

  await removeFromWatchList(folderPath, projectName);
}
