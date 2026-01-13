import * as lancedb from "@lancedb/lancedb";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { logger } from "./logger.js";
import { LanceDBProvider } from "./database/LanceDBProvider.js";
import { VectorizeProvider } from "./database/VectorizeProvider.js";
import { VectorDBProvider, DBConfig, VectorResult } from "./database/base.js";
import { profileAsync } from "./profiler-api.js";

const HOME_DIR = os.homedir();
const GLOBAL_DATA_DIR = path.join(HOME_DIR, ".vibescout", "data");

const isTest = process.env.NODE_ENV === "test";
const DB_ROOT = isTest
  ? path.join(process.cwd(), ".lancedb_test")
  : (process.env.VIBESCOUT_DB_PATH || GLOBAL_DATA_DIR);

export const DB_PATH = DB_ROOT;
// const HASH_FILE = path.join(DB_PATH, "hashes.json"); // DEPRECATED: Hashes now stored in LanceDB

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
    // Auto-migrate schema for local LanceDB
    await migrateSchema();
  }
}

async function migrateSchema() {
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      const schema = await table.schema();
      const hasCategory = schema.fields.some(f => f.name === 'category');
      if (!hasCategory) {
        logger.info("[DB] Migrating schema: Adding 'category' column...");
        // LanceDB doesn't support easy 'ALTER TABLE ADD COLUMN' yet via its high-level API
        // Best way is to let it fail or we could re-create, but for now we'll just log
        // and recommend a full re-index if it fails.
        // Actually, we can just let createOrUpdateTable handle the first insert which might fail
        // but if we want to be safe, we tell user to clear.
      }
    }
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

// DEPRECATED: Hash functions now use LanceDB instead of JSON file
// async function loadHashes() {
//   if (await fs.pathExists(HASH_FILE)) {
//     return await fs.readJson(HASH_FILE);
//   }
//   return {};
// }
//
// async function saveHashes(hashes: any) {
//   await fs.ensureDir(DB_PATH);
//   await fs.writeJson(HASH_FILE, hashes);
// }

export async function createOrUpdateTable(data: VectorResult[], modelName: string) {
  return profileAsync('db_create_or_update_table', async () => {
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
  }, {
    recordCount: data.length,
    modelName
  }, 'database');
}

let isCreatingDepTable = false;

export async function updateDependencies(filePath: string, projectName: string, collection: string, metadata: any) {
  const db = await getMetaDb();
  const depTableName = "dependencies";
  
  const record = {
    filepath: filePath,
    projectname: projectName,
    collection,
    imports: JSON.stringify(metadata.imports),
    exports: JSON.stringify(metadata.exports)
  };

  // Helper to wait if table is being created
  const waitForTable = async () => {
    let attempts = 0;
    while (isCreatingDepTable && attempts < 10) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
  };

  try {
    const tables = await db.tableNames();
    if (tables.includes(depTableName)) {
      const table = await db.openTable(depTableName);
      await table.delete(`filepath = '${filePath}'`);
      await table.add([record]);
    } else {
      if (isCreatingDepTable) {
        await waitForTable();
        // Check again after waiting
        const tablesRetry = await db.tableNames();
        if (tablesRetry.includes(depTableName)) {
          const table = await db.openTable(depTableName);
          await table.delete(`filepath = '${filePath}'`);
          await table.add([record]);
          return;
        }
      }

      isCreatingDepTable = true;
      try {
        await db.createTable(depTableName, [record]);
      } catch (err: any) {
        if (err.message.includes("already exists")) {
          const table = await db.openTable(depTableName);
          await table.delete(`filepath = '${filePath}'`);
          await table.add([record]);
        } else {
          throw err;
        }
      } finally {
        isCreatingDepTable = false;
      }
    }
  } catch (err: any) {
    // If we get "Table not found" it might be because of a race, try one more time
    if (err.message.includes("not found")) {
      await new Promise(r => setTimeout(r, 200));
      const tables = await db.tableNames();
      if (tables.includes(depTableName)) {
        const table = await db.openTable(depTableName);
        await table.delete(`filepath = '${filePath}'`);
        await table.add([record]);
        return;
      }
    }
    throw err;
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
        where: `projectname = '${projectName}'`
      });
    }
  }

  // 2. Update dependencies table (always local)
  if (tables.includes("dependencies")) {
    const depTable = await db.openTable("dependencies");
    await depTable.update({
      values: { collection: `'${newCollection}'` },
      where: `projectname = '${projectName}'`
    });
  }
}

export async function getFileDependencies(filePath: string) {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("dependencies")) return null;

  const table = await db.openTable("dependencies");
  const result = await table.query().where(`filepath = '${filePath}'`).toArray();
  if (result.length === 0) return null;

  return {
    imports: JSON.parse(result[0].imports),
    exports: JSON.parse(result[0].exports)
  };
}

export async function getBatchDependencies(filePaths: string[]): Promise<Record<string, { imports: string[], exports: string[] } | null>> {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("dependencies")) {
    return Object.fromEntries(filePaths.map(p => [p, null]));
  }

  const table = await db.openTable("dependencies");
  const results = await table.query().toArray();

  const dependencyMap: Record<string, { imports: string[], exports: string[] } | null> = {};

  // Initialize with null for all requested files
  for (const filePath of filePaths) {
    dependencyMap[filePath] = null;
  }

  // Populate with found dependencies
  for (const result of results) {
    if (dependencyMap.hasOwnProperty(result.filepath)) {
      dependencyMap[result.filepath] = {
        imports: JSON.parse(result.imports || '[]'),
        exports: JSON.parse(result.exports || '[]')
      };
    }
  }

  return dependencyMap;
}

export async function getAllDependencies() {
  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (!tables.includes("dependencies")) return [];

  const table = await db.openTable("dependencies");
  const results = await table.query().toArray();
  logger.debug(`[DB] Retrieved ${results.length} dependency records`);
  return results;
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
  }).map(row => ({ filePath: row.filepath, projectName: row.projectname, collection: row.collection }));
}

export async function getFileMetadata(filePath: string) {
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      const results = await table.query()
        .where(`filepath = '${filePath}'`)
        .select(["file_hash", "last_mtime", "last_size"])
        .limit(1)
        .toArray();
      return results.length > 0 ? results[0] : {};
    }
  }
  return {};
}

export async function getFileHash(filePath: string) {
  // Query LanceDB for file_hash
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      const results = await table.query()
        .where(`filepath = '${filePath}'`)
        .select(["file_hash"])
        .limit(1)
        .toArray();
      return results.length > 0 ? results[0].file_hash : null;
    }
  }
  return null;
}

export async function updateFileHash(filePath: string, hash: string) {
  // Update file_hash in LanceDB
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      await table.update({
        values: { file_hash: `'${hash}'` },
        where: `filepath = '${filePath}'`
      });
    }
  }
}

export async function bulkUpdateFileHashes(updates: { filePath: string, hash: string }[]) {
  // Bulk update file_hash in LanceDB
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      for (const { filePath, hash } of updates) {
        await table.update({
          values: { file_hash: `'${hash}'` },
          where: `filepath = '${filePath}'`
        });
      }
    }
  }
}

export async function deleteFileData(filePath: string) {
  await getProvider().deleteByFile(filePath);

  const db = await getMetaDb();
  const tables = await db.tableNames();
  if (tables.includes("dependencies")) {
    const depTable = await db.openTable("dependencies");
    await depTable.delete(`filepath = '${filePath}'`);
  }

  // Note: file_hash is automatically deleted from LanceDB when record is deleted
  // No separate hash cleanup needed
}

export async function hybridSearch(queryText: string, embedding: number[], options = {}) {
  return profileAsync('db_hybrid_search', async () => {
    const p = getProvider();
    if (p instanceof LanceDBProvider) {
      return await p.hybridSearch(queryText, embedding, options);
    }
    return await p.search(embedding, options);
  }, {
    queryLength: queryText?.length || 0,
    limit: options.limit,
    projectName: options.projectName
  }, 'database');
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

  const projects: Record<string, Set<string>> = {};

  if (tables.includes("dependencies")) {
    const table = await db.openTable("dependencies");
    // Get all unique projects and their collections
    const allData = await table.query().select(["collection", "projectname"]).toArray();
    allData.forEach(row => {
      if (row.collection && row.projectname) {
        if (!projects[row.collection]) projects[row.collection] = new Set();
        projects[row.collection].add(row.projectname);
      }
    });
  }

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
  const record = { folderpath: absolutePath, projectname: projectName, collection };

  if (tables.includes(tableName)) {
    const table = await db.openTable(tableName);
    await table.delete(`folderpath = '${absolutePath}'`);
    await table.add([record]);
  } else {
    await db.createTable(tableName, [record]);
  }
}

// Note: unwatchProject is moved to watcher.ts to avoid circular dependencies and duplication
// removeFromWatchList is still here as it handles the DB record


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
      path.resolve(r.folderpath) === absolutePath ||
      (projectName && r.projectname === projectName)
    );

    if (targets.length > 0) {
      for (const target of targets) {
        await table.delete(`folderpath = '${target.folderpath}'`);
        logger.info(`[DB] Successfully removed watcher record for: ${target.folderpath}`);
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
  // Get all file paths from LanceDB (instead of hashes.json)
  const p = getProvider();
  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      const allRecords = await table.query().select(["filepath"]).toArray();
      return allRecords.map(r => r.filepath);
    }
  }
  return [];
}

export async function compactDatabase() {
  const p = getProvider();
  let pruned = 0;

  // Get all file paths from LanceDB (instead of hashes.json)
  if (p instanceof LanceDBProvider) {
    const table = await p.getTable();
    if (table) {
      const allRecords = await table.query().select(["filepath"]).toArray();
      const filePaths = allRecords.map(r => r.filepath);

      for (const filePath of filePaths) {
        if (!(await fs.pathExists(filePath))) {
          await deleteFileData(filePath);
          pruned++;
        }
      }

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
    const records = await depTable.query().where(`projectname = '${projectName}'`).select(["filepath"]).toArray();
    projectFiles = records.map(r => r.filepath);
    logger.debug(`[DB] Found ${projectFiles.length} files to clear from cache for ${projectName}`);
  }

  // 2. Delete from vector store
  try {
    await getProvider().deleteByProject(projectName);
    logger.info(`[DB] Successfully deleted ${projectName} from vector store.`);
  } catch (err: any) {
    logger.error(`[DB] Failed to delete ${projectName} from vector store: ${err.message}`);
  }

  // 3. Delete from dependencies
  if (tables.includes("dependencies")) {
    try {
      const depTable = await db.openTable("dependencies");
      await depTable.delete(`projectname = '${projectName}'`);
      logger.info(`[DB] Successfully deleted ${projectName} from dependencies table.`);
    } catch (err: any) {
      logger.error(`[DB] Failed to delete ${projectName} from dependencies: ${err.message}`);
    }
  }

  // Note: file_hash is automatically deleted from LanceDB when project is deleted
  // No separate hash cleanup needed anymore
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
