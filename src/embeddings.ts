import { env, pipeline } from "@huggingface/transformers";
import { logger } from "./logger.js";
import { LocalProvider } from "./providers/LocalProvider.js";
import { OllamaProvider } from "./providers/OllamaProvider.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";
import { CloudflareProvider } from "./providers/CloudflareProvider.js";
import { GeminiProvider } from "./providers/GeminiProvider.js";
import { ZAIProvider } from "./providers/ZAIProvider.js";
import { BedrockProvider } from "./providers/BedrockProvider.js";
import { EmbeddingProvider, SummarizerProvider, ProviderConfig } from "./providers/base.js";

export function configureEnvironment(modelsPath: string, offlineMode: boolean = false) {
  if (modelsPath) {
    env.localModelPath = modelsPath;
    if (offlineMode) {
      env.allowRemoteModels = false;
    }
  }
}

// Initial configuration
configureEnvironment(process.env.MODELS_PATH || "", process.env.OFFLINE_MODE === "true");

export class EmbeddingManager {
  private provider: EmbeddingProvider;
  private currentModel: string;

  constructor() {
    this.currentModel = process.env.EMBEDDING_MODEL || "Xenova/bge-small-en-v1.5";
    this.provider = new LocalProvider(this.currentModel);
  }

  async setProvider(config: ProviderConfig) {
    this.currentModel = config.modelName;
    if (config.type === 'ollama') {
      this.provider = new OllamaProvider(config.modelName, config.baseUrl);
    } else if (config.type === 'openai') {
      this.provider = new OpenAIProvider(config.modelName, config.apiKey || "", config.baseUrl);
    } else if (config.type === 'cloudflare') {
      this.provider = new CloudflareProvider(config.modelName, config.accountId || "", config.apiKey || "");
    } else if (config.type === 'gemini') {
      this.provider = new GeminiProvider(config.modelName, config.apiKey || "");
    } else if (config.type === 'zai') {
      this.provider = new ZAIProvider(config.modelName, config.apiKey || "");
    } else if (config.type === 'bedrock') {
      this.provider = new BedrockProvider(config.modelName, config.awsRegion || "us-east-1", config.awsProfile);
    } else {
      this.provider = new LocalProvider(config.modelName);
    }
  }

  async setModel(modelName: string) {
    if (this.currentModel !== modelName) {
      this.currentModel = modelName;
      // If we are on local, we need to re-init
      if (this.provider instanceof LocalProvider) {
        this.provider = new LocalProvider(modelName);
      }
    }
  }

  getModel() {
    return this.currentModel;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.provider.generateEmbedding(text);
  }
}

class RerankerManager {
  private modelName: string = "Xenova/bge-reranker-base";
  private pipe: any = null;

  async getPipe() {
    if (!this.pipe) {
      logger.debug(`[Reranker] Loading model: ${this.modelName}...`);
      this.pipe = await pipeline("text-classification", this.modelName, {
        progress_callback: (progress: any) => {
          if (progress.status === "progress") {
            logger.debug(`[Reranker] Loading ${progress.file}: ${Math.round(progress.progress)}%`);
          }
        }
      });
    }
    return this.pipe;
  }

  async rerank(query: string, documents: any[], topK: number = 5) {
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
  private provider: SummarizerProvider;
  public modelName: string;

  constructor() {
    this.modelName = "Xenova/distilbart-cnn-6-6";
    this.provider = new LocalProvider(this.modelName);
  }

  async setProvider(config: ProviderConfig) {
    this.modelName = config.modelName;
    if (config.type === 'ollama') {
      this.provider = new OllamaProvider(config.modelName, config.baseUrl);
    } else if (config.type === 'openai') {
      this.provider = new OpenAIProvider(config.modelName, config.apiKey || "", config.baseUrl);
    } else if (config.type === 'cloudflare') {
      this.provider = new CloudflareProvider(config.modelName, config.accountId || "", config.apiKey || "");
    } else if (config.type === 'gemini') {
      this.provider = new GeminiProvider(config.modelName, config.apiKey || "");
    } else if (config.type === 'zai') {
      this.provider = new ZAIProvider(config.modelName, config.apiKey || "");
    } else if (config.type === 'bedrock') {
      this.provider = new BedrockProvider(config.modelName, config.awsRegion || "us-east-1", config.awsProfile);
    } else {
      this.provider = new LocalProvider(config.modelName);
    }
  }

  async summarize(text: string): Promise<string> {
    return this.provider.summarize(text);
  }

  async generateResponse(prompt: string, context: string): Promise<string> {
    return this.provider.generateResponse(prompt, context);
  }
}

export const embeddingManager = new EmbeddingManager();
export const rerankerManager = new RerankerManager();
export const summarizerManager = new SummarizerManager();
