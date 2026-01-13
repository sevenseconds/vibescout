import { VectorDBProvider, VectorResult, SearchOptions } from "./base.js";
import { logger } from "../logger.js";
import crypto from "crypto";

export class VectorizeProvider implements VectorDBProvider {
  name: string = "cloudflare-vectorize";
  private accountId: string;
  private apiToken: string;
  private indexName: string;

  constructor(accountId: string, apiToken: string, indexName: string) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.indexName = indexName;
  }

  private getBaseUrl() {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/vectorize/v1/indexes/${this.indexName}`;
  }

  private generateId(r: VectorResult): string {
    // Unique ID for Vectorize
    return crypto.createHash("md5")
      .update(`${r.filepath}-${r.startline}-${r.name}`)
      .digest("hex");
  }

  async insert(data: VectorResult[]): Promise<void> {
    try {
      const vectors = data.map(r => ({
        id: this.generateId(r),
        values: r.vector,
        metadata: {
          collection: r.collection,
          projectname: r.projectname,
          name: r.name,
          type: r.type,
          category: r.category || (r.filepath?.endsWith('.md') ? 'documentation' : 'code'),
          filepath: r.filepath,
          startline: r.startline,
          endline: r.endline,
          comments: r.comments.substring(0, 1000), // metadata limit
          content: r.content.substring(0, 5000),
          summary: r.summary || ""
        }
      }));

      // Cloudflare has limits on batch size (usually 100-1000)
      const batchSize = 100;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        const response = await fetch(`${this.getBaseUrl()}/insert`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(batch)
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Vectorize insert failed: ${err}`);
        }
      }
    } catch (err: any) {
      logger.error(`Vectorize insert error: ${err.message}`);
      throw err;
    }
  }

  async search(embedding: number[], options: SearchOptions): Promise<VectorResult[]> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/query`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          vector: embedding,
          topK: options.limit || 20,
          returnMetadata: "all"
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Vectorize query failed: ${err}`);
      }

      const data = await response.json() as { result: { matches: any[] } };
      let results = data.result.matches.map(m => ({
        ...m.metadata,
        score: m.score
      } as VectorResult));

      // Existing filters
      if (options.collection) results = results.filter(r => r.collection === options.collection);
      if (options.projectName) results = results.filter(r => r.projectname === options.projectName);
      if (options.categories && options.categories.length > 0) {
        results = results.filter(r => options.categories!.includes(r.category));
      }
      if (options.fileTypes && options.fileTypes.length > 0) {
        results = results.filter(r => {
          const path = r.filepath.toLowerCase();
          return options.fileTypes!.some(ext => path.endsWith(ext.toLowerCase()));
        });
      }

      // NEW: Git filters
      if (options.authors && options.authors.length > 0) {
        results = results.filter(r =>
          r.last_commit_author && options.authors!.includes(r.last_commit_author)
        );
      }
      if (options.dateFrom) {
        results = results.filter(r =>
          r.last_commit_date && r.last_commit_date >= options.dateFrom!
        );
      }
      if (options.dateTo) {
        results = results.filter(r =>
          r.last_commit_date && r.last_commit_date <= options.dateTo!
        );
      }
      if (options.churnLevels && options.churnLevels.length > 0) {
        results = results.filter(r =>
          r.churn_level && options.churnLevels!.includes(r.churn_level)
        );
      }

      return results;
    } catch (err: any) {
      logger.error(`Vectorize search error: ${err.message}`);
      return [];
    }
  }

  async hybridSearch(queryText: string, embedding: number[], options: SearchOptions): Promise<VectorResult[]> {
    // Vectorize doesn't natively support hybrid FTS search via REST yet.
    // Fall back to vector search.
    return this.search(embedding, options);
  }

  async deleteByFile(filePath: string): Promise<void> {
    // Vectorize deletion by metadata is not supported via REST API easily.
    // Usually you need IDs.
    // For VibeScout, since we want full Cloudflare support,
    // we would ideally need to track which IDs belong to which file.
    // For now, we'll log that file-level pruning is restricted in cloud mode.
    logger.debug(`File-level deletion requested for ${filePath} in Vectorize mode. (Note: Pruning requires IDs)`);
  }

  async deleteByProject(projectName: string): Promise<void> {
    logger.debug(`Project-level deletion requested for ${projectName} in Vectorize mode. (Note: Pruning requires IDs)`);
  }

  async clear(): Promise<void> {
    // Not safely implemented via REST to avoid accidental data loss.
    logger.warn("Clear database requested in Vectorize mode. Please use Cloudflare Dashboard to reset your index.");
  }

  async close(): Promise<void> {
    // REST based, nothing to close
  }
}
