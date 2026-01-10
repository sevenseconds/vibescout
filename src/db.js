import * as lancedb from "@lancedb/lancedb";
import path from "path";
import fs from "fs-extra";

const DB_NAME = process.env.NODE_ENV === "test" ? ".lancedb_test" : ".lancedb";
const DB_PATH = path.join(process.cwd(), DB_NAME);
const HASH_FILE = path.join(DB_PATH, "hashes.json");

let activeDb = null;

async function getDb() {
  await fs.ensureDir(DB_PATH);
  if (!activeDb) {
    activeDb = await lancedb.connect(DB_PATH);
  }
  return activeDb;
}

export async function getTable() {
  const db = await getDb();
  try {
    return await db.openTable("code_search");
  } catch {
    return null;
  }
}

async function loadHashes() {
  if (await fs.pathExists(HASH_FILE)) {
    return await fs.readJson(HASH_FILE);
  }
  return {};
}

async function saveHashes(hashes) {
  await fs.ensureDir(DB_PATH);
  await fs.writeJson(HASH_FILE, hashes);
}

export async function createOrUpdateTable(data, modelName) {
  const db = await getDb();
  const tableName = "code_search";
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
    } catch (err) {
      if (!err.message.includes("already exists")) throw err;
    }
  }

  if (tables.includes(tableName)) {
    const table = await db.openTable(tableName);
    await table.add(data);
  } else {
    try {
      const table = await db.createTable(tableName, data);
      await table.createIndex("content", { config: lancedb.Index.fts() });
    } catch (err) {
      if (err.message.includes("already exists")) {
        const table = await db.openTable(tableName);
        await table.add(data);
      } else {
        throw err;
      }
    }
  }
}

export async function updateDependencies(filePath, projectName, collection, metadata) {
  const db = await getDb();
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
    } catch (err) {
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

export async function moveProjectToCollection(projectName, newCollection) {
  const db = await getDb();
  const tables = await db.tableNames();
  
  // 1. Update code_search table
  if (tables.includes("code_search")) {
    const table = await db.openTable("code_search");
    await table.update({
      values: { collection: `'${newCollection}'` },
      where: `"projectName" = '${projectName}'`
    });
  }

  // 2. Update dependencies table
  if (tables.includes("dependencies")) {
    const depTable = await db.openTable("dependencies");
    await depTable.update({
      values: { collection: `'${newCollection}'` },
      where: `"projectName" = '${projectName}'`
    });
  }
}

export async function getFileDependencies(filePath) {
  const db = await getDb();
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

export async function findSymbolUsages(symbolName) {
  const db = await getDb();
  const tables = await db.tableNames();
  if (!tables.includes("dependencies")) return [];
  
  const table = await db.openTable("dependencies");
  const all = await table.query().toArray();
  
  return all.filter(row => {
    const imports = JSON.parse(row.imports);
    return imports.some(imp => imp.symbols.includes(symbolName));
  }).map(row => ({ filePath: row.filePath, projectName: row.projectName, collection: row.collection }));
}

export async function getFileHash(filePath) {
  const hashes = await loadHashes();
  return hashes[filePath] || null;
}

export async function updateFileHash(filePath, hash) {
  const hashes = await loadHashes();
  hashes[filePath] = hash;
  await saveHashes(hashes);
}

export async function bulkUpdateFileHashes(updates) {
  const hashes = await loadHashes();
  for (const { filePath, hash } of updates) {
    hashes[filePath] = hash;
  }
  await saveHashes(hashes);
}

export async function deleteFileData(filePath) {
  const table = await getTable();
  if (table) await table.delete(`"filePath" = '${filePath}'`);
  
  const db = await getDb();
  const tables = await db.tableNames();
  if (tables.includes("dependencies")) {
    const depTable = await db.openTable("dependencies");
    await depTable.delete(`"filePath" = '${filePath}'`);
  }

  const hashes = await loadHashes();
  delete hashes[filePath];
  await saveHashes(hashes);
}

export async function hybridSearch(queryText, embedding, options = {}) {
  const table = await getTable();
  if (!table) return [];
  const vectorResults = await table.vectorSearch(embedding).limit(options.limit ? options.limit * 2 : 20).toArray();
  const ftsResults = await table.search(queryText).limit(options.limit ? options.limit * 2 : 20).toArray();
  const seen = new Set();
  const combined = [...ftsResults, ...vectorResults].filter(item => {
    const id = `${item.filePath}-${item.startLine}-${item.name}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  let filteredResults = combined;
  if (options.collection) filteredResults = filteredResults.filter(r => r.collection === options.collection);
  if (options.projectName) filteredResults = filteredResults.filter(r => r.projectName === options.projectName);
  return filteredResults.slice(0, options.limit || 5);
}

export async function search(embedding, options = {}) {
  const table = await getTable();
  if (!table) return [];
  
  const rawResults = await table
    .vectorSearch(embedding)
    .limit(options.limit ? options.limit * 5 : 50)
    .toArray();
    
  let filteredResults = rawResults;
  if (options.collection) filteredResults = filteredResults.filter(r => r.collection === options.collection);
  if (options.projectName) filteredResults = filteredResults.filter(r => r.projectName === options.projectName);

  return filteredResults.slice(0, options.limit || 5);
}

export async function getStoredModel() {
  const db = await getDb();
  const tables = await db.tableNames();
  if (!tables.includes("metadata")) return null;
  const metaTable = await db.openTable("metadata");
  const meta = await metaTable.query().toArray();
  return meta.length > 0 ? meta[0].model : null;
}

export async function listKnowledgeBase() {
  const table = await getTable();
  if (!table) return [];
  const allData = await table.query().select(["collection", "projectName"]).toArray();
  const projects = {};
  allData.forEach(row => {
    if (!projects[row.collection]) projects[row.collection] = new Set();
    projects[row.collection].add(row.projectName);
  });
  return Object.fromEntries(Object.entries(projects).map(([col, projs]) => [col, Array.from(projs)]));
}

export async function getProjectFiles(projectName) {
  const hashes = await loadHashes();
  return Object.keys(hashes);
}

export async function clearDatabase() {
  await closeDb();
  if (await fs.pathExists(DB_PATH)) {
    try {
      await fs.remove(DB_PATH);
    } catch {
      // Ignore directory non-empty errors in parallel tests
    }
  }
}

export async function closeDb() {
  if (activeDb) {
    // Note: Some versions of LanceDB JS might not have close(), 
    // but we should attempt it or nullify the reference.
    if (typeof activeDb.close === "function") {
      await activeDb.close();
    }
    activeDb = null;
  }
}
