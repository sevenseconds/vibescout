import * as lancedb from "@lancedb/lancedb";
import fs from "fs-extra";
import { VectorDBProvider, VectorResult } from "./base.js";
import { logger } from "../logger.js";

export class LanceDBProvider implements VectorDBProvider {
  name: string = "lancedb";
  private dbPath: string;
  private activeDb: lancedb.Connection | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private async getDb() {
    await fs.ensureDir(this.dbPath);
    if (!this.activeDb) {
      this.activeDb = await lancedb.connect(this.dbPath);
    }
    return this.activeDb;
  }

  async getTable() {
    const db = await this.getDb();
    try {
      return await db.openTable("code_search");
    } catch {
      return null;
    }
  }

  async insert(data: VectorResult[]): Promise<void> {
    const db = await this.getDb();
    const tableName = "code_search";
    const tables = await db.tableNames();

    if (tables.includes(tableName)) {
      const table = await db.openTable(tableName);
      try {
        await table.add(data);
      } catch (err: any) {
        if (err.message.includes("Found field not in schema: category")) {
          logger.info("[DB] Missing 'category' field detected. Performing automatic schema migration...");

          // 1. Fetch all existing data
          const allData = await table.query().toArray();

          // 2. Add category to existing records (default to 'code' for legacy)
          const migratedData = allData.map(row => ({
            ...row,
            category: row.category || (row.filepath?.endsWith('.md') ? 'documentation' : 'code')
          }));

          // 3. Drop and recreate table with correct schema
          await db.dropTable(tableName);
          const newTable = await db.createTable(tableName, [...migratedData, ...data]);
          await newTable.createIndex("content", { config: lancedb.Index.fts() });

          logger.info(`[DB] Schema migration complete. Migrated ${migratedData.length} records.`);
          return;
        }
        throw err;
      }
    } else {
      const table = await db.createTable(tableName, data);
      await table.createIndex("content", { config: lancedb.Index.fts() });
    }
  }

  async search(embedding: number[], options: { collection?: string; projectName?: string; fileTypes?: string[]; categories?: string[]; limit?: number }): Promise<VectorResult[]> {
    const table = await this.getTable();
    if (!table) return [];

    let query = table.vectorSearch(embedding).limit(options.limit ? options.limit * 5 : 50);
    const results = await query.toArray();

    let filtered = results as unknown as VectorResult[];
    if (options.collection) filtered = filtered.filter(r => r.collection === options.collection);
    if (options.projectName) filtered = filtered.filter(r => r.projectname === options.projectName);
    if (options.categories && options.categories.length > 0) {
      filtered = filtered.filter(r => options.categories!.includes(r.category));
    }
    if (options.fileTypes && options.fileTypes.length > 0) {
      filtered = filtered.filter(r => {
        const path = r.filepath.toLowerCase();
        return options.fileTypes!.some(ext => path.endsWith(ext.toLowerCase()));
      });
    }

    return filtered.slice(0, options.limit || 10);
  }

  // FTS Search (Unique to LanceDB)
  async hybridSearch(queryText: string, embedding: number[], options: { collection?: string; projectName?: string; fileTypes?: string[]; categories?: string[]; limit?: number }): Promise<VectorResult[]> {
    const table = await this.getTable();
    if (!table) return [];

    const vectorResults = await table.vectorSearch(embedding).limit(options.limit ? options.limit * 2 : 20).toArray();
    const ftsResults = await table.search(queryText).limit(options.limit ? options.limit * 2 : 20).toArray();

    const seen = new Set();
    const combined = [...ftsResults, ...vectorResults].filter(item => {
      const id = `${item.filepath}-${item.startline}-${item.name}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }) as unknown as VectorResult[];

    let filtered = combined;
    if (options.collection) filtered = filtered.filter(r => r.collection === options.collection);
    if (options.projectName) filtered = filtered.filter(r => r.projectname === options.projectName);
    if (options.categories && options.categories.length > 0) {
      filtered = filtered.filter(r => options.categories!.includes(r.category));
    }
    if (options.fileTypes && options.fileTypes.length > 0) {
      filtered = filtered.filter(r => {
        const path = r.filepath.toLowerCase();
        return options.fileTypes!.some(ext => path.endsWith(ext.toLowerCase()));
      });
    }

    return filtered.slice(0, options.limit || 10);
  }

  async deleteByFile(filePath: string): Promise<void> {
    const table = await this.getTable();
    if (table) await table.delete(`filepath = '${filePath}'`);
  }

  async deleteByProject(projectName: string): Promise<void> {
    const table = await this.getTable();
    if (table) await table.delete(`projectname = '${projectName}'`);
  }

  async clear(): Promise<void> {
    if (this.activeDb) {
      this.activeDb = null;
    }
    if (await fs.pathExists(this.dbPath)) {
      await fs.remove(this.dbPath);
    }
  }

  async close() {
    this.activeDb = null;
  }
}
