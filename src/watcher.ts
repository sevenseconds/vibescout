import chokidar from "chokidar";
import path from "path";
import { logger } from "./logger.js";
import { handleIndexFolder, indexSingleFile } from "./core.js";
import { getWatchList, deleteFileData, addToWatchList, removeFromWatchList } from "./db.js";

const watchers = new Map<string, chokidar.FSWatcher>();

export async function initWatcher(force = false) {
  const watchList = await getWatchList();
  logger.info(`Initializing persistent watchers for ${watchList.length} projects...`);
  
  for (const item of watchList) {
    try {
      await startWatching(item.folderPath, item.projectName, item.collection, force);
    } catch (err: any) {
      logger.error(`Failed to start watcher for ${item.folderPath}: ${err.message}`);
    }
  }
}

async function startWatching(folderPath: string, projectName: string, collection: string, force = false) {
  const absolutePath = path.resolve(folderPath);
  if (watchers.has(absolutePath)) return;

  const watcher = chokidar.watch(absolutePath, { 
    ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"], 
    persistent: true, 
    ignoreInitial: true,
    usePolling: process.env.USE_POLLING === "true",
    interval: 1000
  });

  watcher.on("add", f => indexSingleFile(f, projectName, collection))
         .on("change", f => indexSingleFile(f, projectName, collection))
         .on("unlink", f => deleteFileData(f));

  watchers.set(absolutePath, watcher);
  logger.info(`Started real-time watcher for: ${projectName} (${folderPath})`);

  // Run an initial index in background
  handleIndexFolder(folderPath, projectName, collection, true, true, force).catch(err => {
    logger.error(`Initial background index failed for ${folderPath}: ${err.message}`);
  });
}

export async function watchProject(folderPath: string, projectName: string, collection: string = "default") {
  await addToWatchList(folderPath, projectName, collection);
  await startWatching(folderPath, projectName, collection);
  // Trigger initial index
  return handleIndexFolder(folderPath, projectName, collection, true, true);
}

export async function unwatchProject(folderPath: string, projectName?: string) {
  const absolutePath = path.resolve(folderPath);
  logger.info(`[Watcher] Stopping watcher for: ${folderPath}`);
  
  const watcher = watchers.get(absolutePath);
  if (watcher) {
    // Don't await close() to avoid blocking the API response
    // Chokidar can be slow on some systems
    watcher.close().catch(err => logger.error(`[Watcher] Error closing instance: ${err.message}`));
    watchers.delete(absolutePath);
  }
  
  await removeFromWatchList(folderPath, projectName);
}
