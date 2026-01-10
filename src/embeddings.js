import { pipeline, env } from "@huggingface/transformers";

export function configureEnvironment(modelsPath, offlineMode = false) {
  if (modelsPath) {
    env.localModelPath = modelsPath;
    if (offlineMode) {
      env.allowRemoteModels = false;
    }
  }
}

// Initial configuration from environment variables
configureEnvironment(process.env.MODELS_PATH, process.env.OFFLINE_MODE === "true");

export class EmbeddingManager {
  constructor() {
    this.pipe = null;
    this.modelName = process.env.EMBEDDING_MODEL || "Xenova/bge-small-en-v1.5";
  }

  async setModel(modelName) {
    if (this.modelName !== modelName) {
      this.modelName = modelName;
      this.pipe = null; 
    }
  }

  getModel() {
    return this.modelName;
  }

  async getPipe() {
    if (!this.pipe) {
      console.error(`[Embedding] Loading model: ${this.modelName} from ${env.localModelPath || "Hugging Face"}...`);
      this.pipe = await pipeline("feature-extraction", this.modelName, {
        progress_callback: (progress) => {
          if (progress.status === "progress") {
             console.error(`[Embedding] Loading ${progress.file}: ${Math.round(progress.progress)}%`);
          }
        }
      });
      console.error(`[Embedding] Model loaded.`);
    }
    return this.pipe;
  }

  async generateEmbedding(text) {
    const pipe = await this.getPipe();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  }
}

class RerankerManager {
  constructor() {
    this.pipe = null;
    this.modelName = "Xenova/bge-reranker-base";
  }

  async getPipe() {
    if (!this.pipe) {
      console.error(`[Reranker] Loading model: ${this.modelName} from ${env.localModelPath || "Hugging Face"}...`);
      this.pipe = await pipeline("text-classification", this.modelName, {
         progress_callback: (progress) => {
          if (progress.status === "progress") {
             console.error(`[Reranker] Loading ${progress.file}: ${Math.round(progress.progress)}%`);
          }
        }
      });
      console.error(`[Reranker] Model loaded.`);
    }
    return this.pipe;
  }

  async rerank(query, documents, topK = 5) {
    const pipe = await this.getPipe();
    const results = [];
    for (const doc of documents) {
      const output = await pipe(query, { text_pair: doc.content });
      results.push({ ...doc, rerankScore: output[0].score });
    }
    return results.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
  }
}

class SummarizerManager {
  constructor() {
    this.pipe = null;
    this.modelName = "Xenova/distilbart-cnn-6-6"; // Fast and small for local use
  }

  async setModel(modelName) {
    if (this.modelName !== modelName) {
      this.modelName = modelName;
      this.pipe = null;
    }
  }

  async getPipe() {
    if (!this.pipe) {
      console.error(`[Summarizer/BART] Loading model: ${this.modelName} from ${env.localModelPath || "Hugging Face"}...`);
      this.pipe = await pipeline("summarization", this.modelName, {
         progress_callback: (progress) => {
          if (progress.status === "progress") {
             console.error(`[Summarizer/BART] Loading ${progress.file}: ${Math.round(progress.progress)}%`);
          }
        }
      });
      console.error(`[Summarizer/BART] Model loaded.`);
    }
    return this.pipe;
  }

  async summarize(code) {
    try {
      const pipe = await this.getPipe();
      // Bart has a limit, truncate code
      const input = code.substring(0, 1024);
      const output = await pipe(input, {
        max_new_tokens: 40,
        min_new_tokens: 10,
        repetition_penalty: 2.0
      });
      return output[0].summary_text;
    } catch (err) {
      console.error(`Summarization error: ${err.message}`);
      return "";
    }
  }
}

export const embeddingManager = new EmbeddingManager();
export const rerankerManager = new RerankerManager();
export const summarizerManager = new SummarizerManager();