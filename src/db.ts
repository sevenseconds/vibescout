import * as lancedb from "@lancedb/lancedb";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { logger } from "./logger.js";
import { LanceDBProvider } from "./database/LanceDBProvider.js";
import { VectorizeProvider } from "./database/VectorizeProvider.js";
import { VectorDBProvider, DBConfig, VectorResult } from "./database/base.js";

const HOME_DIR = os.homedir();
const GLOBAL_DATA_DIR = path.join(HOME_DIR, ".vibescout", "data");

const isTest = process.env.NODE_ENV === "test";
const DB_ROOT = isTest 
  ? path.join(process.cwd(), ".lancedb_test") 
  : (process.env.VIBESCOUT_DB_PATH || GLOBAL_DATA_DIR);

const DB_PATH = DB_ROOT;
const HASH_FILE = path.join(DB_PATH, "hashes.json");

let activeMetaDb: lancedb.Connection | null = null;
let vectorProvider: VectorDBProvider | null = null;

async function getMetaDb() {
  await fs.ensureDir(DB_PATH);
  if (!activeMetaDb) {
    activeMetaDb = await lancedb.connect(DB_PATH);
  }
  return activeMetaDb;
}

export async function initDB(config: DBConfig) {
  if (config.type === 'cloudflare' && config.accountId && config.apiToken && config.indexName) {
    vectorProvider = new VectorizeProvider(config.accountId, config.apiToken, config.indexName);
  } else {
    vectorProvider = new LanceDBProvider(DB_PATH);
  }
}

function getProvider(): VectorDBProvider {
  if (!vectorProvider) {
    vectorProvider = new LanceDBProvider(DB_PATH);
  }
  return vectorProvider;
}

export async function getTable() {
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    return p.getTable();
  }
  return null;
}

async function loadHashes() {
  if (await fs.pathExists(HASH_FILE)) {
    return await fs.readJson(HASH_FILE);
  }
  return {};
}

async function saveHashes(hashes: any) {
  await fs.ensureDir(DB_PATH);
  await fs.writeJson(HASH_FILE, hashes);
}

export async function createOrUpdateTable(data: VectorResult[], modelName: string) {
  const db = await getMetaDb();
  const metaTableName = "metadata";
  const tables = await db.tableNames();
  
  if (tables.includes(metaTableName)) {
    const metaTable = await db.openTable(metaTableName);
    const meta = await metaTable.query().toArray();
    if (meta.length > 0 && meta[0].model !== modelName) {
      throw new Error(`Model mismatch! Database uses "${meta[0].model}" but you are trying to index with "${modelName}".`);
    }
  } else {
    try {
      await db.createTable(metaTableName, [{ model: modelName }]);
    } catch (err: any) {
      if (!err.message.includes("already exists")) throw err;
    }
  }

  await getProvider().insert(data);
}

export async function updateDependencies(filePath: string, projectName: string, collection: string, metadata: any) {
  const db = await getMetaDb();
  const depTableName = "dependencies";
  const tables = await db.tableNames();
  
  const record = {
    filePath,
    projectName,
    collection,
    imports: JSON.stringify(metadata.imports),
    exports: JSON.stringify(metadata.exports)
  };

  if (tables.includes(depTableName)) {
    const table = await db.openTable(depTableName);
    await table.delete(`"filePath" = '${filePath}'`);
    await table.add([record]);
  } else {
    try {
      await db.createTable(depTableName, [record]);
    } catch (err: any) {
      if (err.message.includes("already exists")) {
        const table = await db.openTable(depTableName);
        await table.delete(`"filePath" = '${filePath}'`);
        await table.add([record]);
      } else {
        throw err;
      }
    }
  }
}

export async function moveProjectToCollection(projectName: string, newCollection: string) {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  
  // 1. Update code_search table (if local)
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      await table.update({
        values: { collection: `'${newCollection}'` },
        where: `"projectName" = '${projectName}'`
      });
    }
  }

  // 2. Update dependencies table (always local)
  if (tables.includes("dependencies")) {
    const depTable = await db.openTable("dependencies");
    await depTable.update({
      values: { collection: `'${newCollection}'` },
      where: `"projectName" = '${projectName}'`
    });
  }
}

export async function getFileDependencies(filePath: string) {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("dependencies")) return null;
  
  const table = await db.openTable("dependencies");
  const result = await table.query().where(`"filePath" = '${filePath}'`).toArray();
  if (result.length === 0) return null;
  
  return {
    imports: JSON.parse(result[0].imports),
    exports: JSON.parse(result[0].exports)
  };
}

export async function getAllDependencies() {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("dependencies")) return [];
  
  const table = await db.openTable("dependencies");
  return await table.query().toArray();
}

export async function findSymbolUsages(symbolName: string) {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("dependencies")) return [];
  
  const table = await db.openTable("dependencies");
  const all = await table.query().toArray();
  
  return all.filter(row => {
    const imports = JSON.parse(row.imports);
    return imports.some((imp: any) => 
      (imp.symbols && imp.symbols.includes(symbolName)) || 
      imp.source === symbolName ||
      imp.source.endsWith("." + symbolName) ||
      imp.source.endsWith("/" + symbolName)
    );
  }).map(row => ({ filePath: row.filePath, projectName: row.projectName, collection: row.collection }));
}

export async function getFileHash(filePath: string) {
  const hashes = await loadHashes();
  return hashes[filePath] || null;
}

export async function updateFileHash(filePath: string, hash: string) {
  const hashes = await loadHashes();
  hashes[filePath] = hash;
  await saveHashes(hashes);
}

export async function bulkUpdateFileHashes(updates: { filePath: string, hash: string }[]) {
  const hashes = await loadHashes();
  for (const { filePath, hash } of updates) {
    hashes[filePath] = hash;
  }
  await saveHashes(hashes);
}

export async function deleteFileData(filePath: string) {
  await getProvider().deleteByFile(filePath);
  
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (tables.includes("dependencies")) {
    const depTable = await db.openTable("dependencies");
    await depTable.delete(`"filePath" = '${filePath}'`);
  }

  const hashes = await loadHashes();
  delete hashes[filePath];
  await saveHashes(hashes);
}

export async function hybridSearch(queryText: string, embedding: number[], options = {}) {
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    return p.hybridSearch(queryText, embedding, options);
  }
  return p.search(embedding, options);
}

export async function search(embedding: number[], options = {}) {
  return getProvider().search(embedding, options);
}

export async function getStoredModel() {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("metadata")) return null;
  const metaTable = await db.openTable("metadata");
  const meta = await metaTable.query().toArray();
  return meta.length > 0 ? meta[0].model : null;
}

export async function listKnowledgeBase() {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("dependencies")) return {};
  
  const table = await db.openTable("dependencies");
  const allData = await table.query().select(["collection", "projectName"]).toArray();
  const projects: Record<string, Set<string>> = {};
  allData.forEach(row => {
    if (!projects[row.collection]) projects[row.collection] = new Set();
    projects[row.collection].add(row.projectName);
  });
  return Object.fromEntries(Object.entries(projects).map(([col, projs]) => [col, Array.from(projs)]));
}

export async function getWatchList() {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("watch_list")) return [];
  const table = await db.openTable("watch_list");
  return await table.query().toArray();
}

export async function addToWatchList(folderPath: string, projectName: string, collection: string) {
  const db = await getMetaDb();
  const tableName = "watch_list";
  const tables = await db.tableNames();
  const absolutePath = path.resolve(folderPath);
  const record = { folderPath: absolutePath, projectName, collection };

  if (tables.includes(tableName)) {
    const table = await db.openTable(tableName);
    await table.delete(`"folderPath" = '${absolutePath}'`);
    await table.add([record]);
  } else {
    await db.createTable(tableName, [record]);
  }
}

export async function unwatchProject(folderPath: string, projectName?: string) {
  const absolutePath = path.resolve(folderPath);
  logger.info(`[Watcher] Attempting to stop watcher for: ${folderPath}`);
  
  const watcher = watchers.get(absolutePath);
  if (watcher) {
    await watcher.close();
    watchers.delete(absolutePath);
  }
  
  await removeFromWatchList(folderPath, projectName);
}

export async function removeFromWatchList(folderPath: string, projectName?: string) {
  const db = await getMetaDb();
  const tableName = "watch_list";
  const tables = await db.tableNames();
  if (tables.includes(tableName)) {
    const table = await db.openTable(tableName);
    const absolutePath = path.resolve(folderPath);
    
    const all = await table.query().toArray();
    // Find all matching targets (handles potential duplicates or path variations)
    const targets = all.filter(r => 
      path.resolve(r.folderPath) === absolutePath || 
      (projectName && r.projectName === projectName)
    );

    if (targets.length > 0) {
      for (const target of targets) {
        await table.delete(`"folderPath" = '${target.folderPath}'`);
        logger.info(`[DB] Successfully removed watcher record for: ${target.folderPath}`);
      }
    } else {
      logger.warn(`[DB] No matching watcher found for ${folderPath} (${projectName || ''})`);
    }
  }
}

export async function getChatMessages() {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("chat_messages")) return [];
  const table = await db.openTable("chat_messages");
  return await table.query().toArray();
}

export async function addChatMessage(role: 'user' | 'assistant', content: string) {
  const db = await getMetaDb();
  const tableName = "chat_messages";
  const tables = await db.tableNames();
  const record = { role, content, timestamp: new Date().toISOString() };

  if (tables.includes(tableName)) {
    const table = await db.openTable(tableName);
    await table.add([record]);
  } else {
    await db.createTable(tableName, [record]);
  }
}

export async function clearChatMessages() {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (tables.includes("chat_messages")) {
    const table = await db.openTable("chat_messages");
    await table.delete("1=1");
  }
}

export async function getProjectFiles() {
  const hashes = await loadHashes();
  return Object.keys(hashes);
}

export async function compactDatabase() {
  const p = getProvider();
  const hashes = await loadHashes();
  const filePaths = Object.keys(hashes);
  let pruned = 0;

  for (const filePath of filePaths) {
    if (!(await fs.pathExists(filePath))) {
      await deleteFileData(filePath);
      pruned++;
    }
  }

  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      try {
        await table.cleanupOldVersions();
        await table.compactFiles();
      } catch { }
    }
  }

  return { pruned, optimized: true };
}

export async function deleteProject(projectName: string) {
  logger.info(`[DB] Attempting to delete project index: ${projectName}`);
  const db = await getMetaDb();
  const tables = await db.tableNames();
  
  // 1. Get all file paths for this project from dependencies before we delete them
  let projectFiles: string[] = [];
  if (tables.includes("dependencies")) {
    const depTable = await db.openTable("dependencies");
    const records = await depTable.query().where(`"projectName" = '${projectName}'`).select(["filePath"]).toArray();
    projectFiles = records.map(r => r.filePath);
    logger.debug(`[DB] Found ${projectFiles.length} files to clear from cache for ${projectName}`);
  }

  // 2. Delete from vector store
  await getProvider().deleteByProject(projectName);
  logger.info(`[DB] Successfully deleted ${projectName} from vector store.`);

  // 3. Delete from dependencies
  if (tables.includes("dependencies")) {
    const depTable = await db.openTable("dependencies");
    await depTable.delete(`"projectName" = '${projectName}'`);
    logger.info(`[DB] Successfully deleted ${projectName} from dependencies table.`);
  }

  // 4. Clear file hashes so it can be re-indexed
  if (projectFiles.length > 0) {
    const hashes = await loadHashes();
    for (const fp of projectFiles) {
      delete hashes[fp];
    }
    await saveHashes(hashes);
    logger.debug(`[DB] Successfully cleared ${projectFiles.length} file hashes for ${projectName}.`);
  }
}

export async function clearDatabase() {
  await closeDb();
  await getProvider().clear();
  if (await fs.pathExists(DB_PATH)) {
    try {
      await fs.remove(DB_PATH);
    } catch { }
  }
}

export async function closeDb() {
  activeMetaDb = null;
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    await p.close();
  }
  vectorProvider = null;
}
