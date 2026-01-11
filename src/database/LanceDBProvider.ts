import * as lancedb from "@lancedb/lancedb";
import fs from "fs-extra";
import { VectorDBProvider, VectorResult } from "./base.js";

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
      await table.add(data);
    } else {
      const table = await db.createTable(tableName, data);
      await table.createIndex("content", { config: lancedb.Index.fts() });
    }
  }

  async search(embedding: number[], options: { collection?: string; projectName?: string; fileType?: string; limit?: number }): Promise<VectorResult[]> {
    const table = await this.getTable();
    if (!table) return [];

    let query = table.vectorSearch(embedding).limit(options.limit ? options.limit * 5 : 50);
    const results = await query.toArray();

    let filtered = results as unknown as VectorResult[];
    if (options.collection) filtered = filtered.filter(r => r.collection === options.collection);
    if (options.projectName) filtered = filtered.filter(r => r.projectName === options.projectName);
    if (options.fileType) filtered = filtered.filter(r => r.filePath.toLowerCase().endsWith(options.fileType!.toLowerCase()));

    return filtered.slice(0, options.limit || 10);
  }

  // FTS Search (Unique to LanceDB)
  async hybridSearch(queryText: string, embedding: number[], options: { collection?: string; projectName?: string; fileType?: string; limit?: number }): Promise<VectorResult[]> {
    const table = await this.getTable();
    if (!table) return [];

    const vectorResults = await table.vectorSearch(embedding).limit(options.limit ? options.limit * 2 : 20).toArray();
    const ftsResults = await table.search(queryText).limit(options.limit ? options.limit * 2 : 20).toArray();

    const seen = new Set();
    const combined = [...ftsResults, ...vectorResults].filter(item => {
      const id = `${item.filePath}-${item.startLine}-${item.name}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }) as unknown as VectorResult[];

    let filtered = combined;
    if (options.collection) filtered = filtered.filter(r => r.collection === options.collection);
    if (options.projectName) filtered = filtered.filter(r => r.projectName === options.projectName);
    if (options.fileType) filtered = filtered.filter(r => r.filePath.toLowerCase().endsWith(options.fileType!.toLowerCase()));

    return filtered.slice(0, options.limit || 10);
  }

  async deleteByFile(filePath: string): Promise<void> {
    const table = await this.getTable();
    if (table) await table.delete(`"filePath" = '${filePath}'`);
  }

  async deleteByProject(projectName: string): Promise<void> {
    const table = await this.getTable();
    if (table) await table.delete(`"projectName" = '${projectName}'`);
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
