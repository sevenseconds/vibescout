import { env, pipeline } from "@huggingface/transformers";
import { logger } from "./logger.js";
import { LocalProvider } from "./providers/LocalProvider.js";
import { OllamaProvider } from "./providers/OllamaProvider.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";
import { CloudflareProvider } from "./providers/CloudflareProvider.js";
import { GeminiProvider } from "./providers/GeminiProvider.js";
import { ZAIProvider, ZAICodingProvider } from "./providers/ZAIProvider.js";
import { BedrockProvider } from "./providers/BedrockProvider.js";
import { EmbeddingProvider, SummarizerProvider, ProviderConfig } from "./providers/base.js";
import { getThrottler } from "./throttler.js";
import { getRegistry } from "./plugins/registry.js";
import { profileAsync } from "./profiler-api.js";

export function configureEnvironment(modelsPath: string, offlineMode: boolean = false) {
  if (modelsPath) {
    env.localModelPath = modelsPath;
    env.allowLocalModels = true;
  }
  
  if (offlineMode) {
    env.allowRemoteModels = false;
    // When offline, we should NOT try to fetch from any remote Hub
    env.remoteHost = "";
    env.remotePathTemplate = "";
  }
}

// Initial configuration
configureEnvironment(process.env.MODELS_PATH || "", process.env.OFFLINE_MODE === "true");

export class EmbeddingManager {
  private provider: EmbeddingProvider;
  private currentModel: string;
  private throttlingErrors: string[] = [];

  constructor() {
    this.currentModel = process.env.EMBEDDING_MODEL || "Xenova/bge-small-en-v1.5";
    this.provider = new LocalProvider(this.currentModel);
  }

  async setProvider(config: ProviderConfig, throttlingErrors: string[] = []) {
    this.currentModel = config.modelName;
    this.throttlingErrors = throttlingErrors;

    // Check for provider plugin first
    if (config.pluginName) {
      const registry = getRegistry();
      const plugin = registry.getProvider(config.pluginName, 'embedding');

      if (plugin) {
        // Use plugin's createProvider method if available, otherwise use plugin directly
        this.provider = plugin.createProvider
          ? plugin.createProvider(config)
          : plugin;

        // Initialize the provider if it has an initialize method
        if (this.provider.initialize) {
          await this.provider.initialize(config);
        }

        logger.info(`[EmbeddingManager] Using provider plugin: ${config.pluginName}`);
        return;
      } else {
        logger.warn(`[EmbeddingManager] Provider plugin "${config.pluginName}" not found, falling back to built-in`);
      }
    }

    // Fall back to built-in providers
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
    } else if (config.type === 'zai-coding' as any) {
      this.provider = new ZAICodingProvider(config.modelName, config.apiKey || "");
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
    return profileAsync('embedding_generate_single', async () => {
      const throttler = getThrottler(this.provider.name, this.throttlingErrors);
      return await throttler.run(() => this.provider.generateEmbedding(text));
    }, {
      provider: this.provider.name,
      model: this.currentModel,
      textLength: text.length
    }, 'embedding');
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    return profileAsync('embedding_generate_batch', async () => {
      // If provider supports batching, use it
      if (this.provider.generateEmbeddingsBatch) {
        const throttler = getThrottler(this.provider.name, this.throttlingErrors);
        return await throttler.run(() => this.provider.generateEmbeddingsBatch!(texts));
      }

      // Fallback: generate embeddings one by one (with some parallelization)
      const PARALLEL_LIMIT = 5; // Process 5 at a time
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += PARALLEL_LIMIT) {
        const batch = texts.slice(i, i + PARALLEL_LIMIT);
        const batchResults = await Promise.all(
          batch.map(text => this.generateEmbedding(text))
        );
        results.push(...batchResults);
      }

      return results;
    }, {
      provider: this.provider.name,
      model: this.currentModel,
      batchSize: texts.length
    }, 'embedding');
  }
}

class RerankerManager {
  private modelName: string = "Xenova/bge-reranker-base";
  private pipe: any = null;
  private enabled: boolean = true;
  private offline: boolean = false;

  async setProvider(config: { useReranker?: boolean, offline?: boolean }) {
    this.enabled = config.useReranker !== false;
    this.offline = !!config.offline;
  }

  async getPipe() {
    if (this.offline && !this.pipe) {
      // Check if model already exists in cache, if not and offline, we can't load it
      // For now, pipeline will just throw "Unable to get model file path" which we handle in rerank
    }

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
    if (!this.enabled || documents.length === 0) {
      // Use score field as rerankScore when reranker is disabled
      return documents
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, topK)
        .map(d => ({ ...d, rerankScore: d.score || 0 }));
    }

    try {
      const pipe = await this.getPipe();
      const results = [];
      for (const doc of documents) {
        const output = await pipe(query, { text_pair: doc.content });
        let score = output[0].score;

        // Category-based boosting (prioritize code for 'vibe coding' experience)
        if (doc.category === 'code') {
          score *= 1.15; // 15% boost for code
        } else if (doc.category === 'documentation') {
          score *= 0.95; // 5% penalty for documentation to reduce noise
        }

        results.push({ ...doc, rerankScore: score });
      }
      return results.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
    } catch (err: any) {
      logger.warn(`[Reranker] Skipping AI reranking: ${err.message}`);
      // Fallback to original vector search order if reranker fails (e.g. offline and model not found)
      return documents
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, topK)
        .map(d => ({ ...d, rerankScore: d.score || 0 }));
    }
  }
}

export class SummarizerManager {
  private provider: SummarizerProvider;
  public modelName: string;
  private throttlingErrors: string[] = [];

  constructor() {
    this.modelName = "Xenova/distilbart-cnn-6-6";
    this.provider = new LocalProvider(this.modelName);
  }

  async setProvider(config: ProviderConfig, throttlingErrors: string[] = []) {
    this.modelName = config.modelName;
    this.throttlingErrors = throttlingErrors;

    // Check for provider plugin first
    if (config.pluginName) {
      const registry = getRegistry();
      const plugin = registry.getProvider(config.pluginName, 'llm');

      if (plugin) {
        // Use plugin's createProvider method if available, otherwise use plugin directly
        this.provider = plugin.createProvider
          ? plugin.createProvider(config)
          : plugin;

        // Initialize the provider if it has an initialize method
        if (this.provider.initialize) {
          await this.provider.initialize(config);
        }

        logger.info(`[SummarizerManager] Using provider plugin: ${config.pluginName}`);
        return;
      } else {
        logger.warn(`[SummarizerManager] Provider plugin "${config.pluginName}" not found, falling back to built-in`);
      }
    }

    // Fall back to built-in providers
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
    } else if (config.type === 'zai-coding' as any) {
      this.provider = new ZAICodingProvider(config.modelName, config.apiKey || "");
    } else if (config.type === 'bedrock') {
      this.provider = new BedrockProvider(config.modelName, config.awsRegion || "us-east-1", config.awsProfile);
    } else {
      this.provider = new LocalProvider(config.modelName);
    }
  }

  async summarize(text: string, options?: { fileName?: string; projectName?: string; type?: 'parent' | 'chunk'; parentName?: string; promptTemplate?: string; sectionName?: string }): Promise<string> {
    const throttler = getThrottler(this.provider.name, this.throttlingErrors);
    return throttler.run(() => this.provider.summarize(text, options));
  }

  async generateBestQuestion(query: string, context: string): Promise<string> {
    const throttler = getThrottler(this.provider.name, this.throttlingErrors);
    return throttler.run(() => this.provider.generateBestQuestion(query, context));
  }

  async generateResponse(prompt: string, context: string, history?: ChatMessage[]): Promise<string> {
    const throttler = getThrottler(this.provider.name, this.throttlingErrors);
    return throttler.run(() => this.provider.generateResponse(prompt, context, history));
  }
}

export const embeddingManager = new EmbeddingManager();
export const rerankerManager = new RerankerManager();
export const summarizerManager = new SummarizerManager();
