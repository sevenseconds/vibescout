import { pipeline } from "@huggingface/transformers";

export class EmbeddingManager {
  constructor() {
    this.pipe = null;
    this.modelName = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
  }

  async setModel(modelName) {
    if (this.modelName !== modelName) {
      this.modelName = modelName;
      this.pipe = null; // Reset pipe to force reload with new model
    }
  }

  getModel() {
    return this.modelName;
  }

  async getPipe() {
    if (!this.pipe) {
      // Allow switching between Xenova/all-MiniLM-L6-v2 and Xenova/bge-small-en-v1.5
      this.pipe = await pipeline("feature-extraction", this.modelName);
    }
    return this.pipe;
  }

  async generateEmbedding(text) {
    const pipe = await this.getPipe();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  }
}

export const embeddingManager = new EmbeddingManager();

class RerankerManager {
  constructor() {
    this.pipe = null;
    this.modelName = "Xenova/bge-reranker-base";
  }

  async getPipe() {
    if (!this.pipe) {
      this.pipe = await pipeline("text-classification", this.modelName);
    }
    return this.pipe;
  }

  async rerank(query, documents, topK = 5) {
    const pipe = await this.getPipe();
    const results = [];

    for (const doc of documents) {
      // BGE Reranker expects pairs
      const output = await pipe(query, { text_pair: doc.content });
      // The score is usually in the first element's score property
      results.push({ ...doc, rerankScore: output[0].score });
    }

    return results
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);
  }
}

export const rerankerManager = new RerankerManager();
