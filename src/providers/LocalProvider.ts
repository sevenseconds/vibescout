import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { pipeline } from "@huggingface/transformers";
import { logger } from "../logger.js";

export class LocalProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "local";
  private modelName: string;
  private summarizerModelName: string = "Xenova/distilbart-cnn-6-6";
  private embeddingPipe: any = null;
  private summarizerPipe: any = null;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  async getEmbeddingPipe() {
    if (!this.embeddingPipe) {
      logger.debug(`[Local/Embedding] Loading model: ${this.modelName}...`);
      this.embeddingPipe = await pipeline("feature-extraction", this.modelName, {
        progress_callback: (progress: any) => {
          if (progress.status === "progress") {
            logger.debug(`[Local/Embedding] Loading ${progress.file}: ${Math.round(progress.progress)}%`);
          }
        }
      });
    }
    return this.embeddingPipe;
  }

  async getSummarizerPipe() {
    if (!this.summarizerPipe) {
      logger.debug(`[Local/Summarizer] Loading model: ${this.summarizerModelName}...`);
      this.summarizerPipe = await pipeline("summarization", this.summarizerModelName, {
        progress_callback: (progress: any) => {
          if (progress.status === "progress") {
            logger.debug(`[Local/Summarizer] Loading ${progress.file}: ${Math.round(progress.progress)}%`);
          }
        }
      });
    }
    return this.summarizerPipe;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const pipe = await this.getEmbeddingPipe();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  }

  async summarize(text: string): Promise<string> {
    try {
      const pipe = await this.getSummarizerPipe();
      const input = text.substring(0, 1024);
      const output = await pipe(input, {
        max_new_tokens: 40,
        min_new_tokens: 10,
        repetition_penalty: 2.0
      });
      return output[0].summary_text;
    } catch (err: any) {
      logger.error(`Local Summarization failed: ${err.message}`);
      return "";
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    // Local BART is mostly a summarizer, but we can try to use it for simple context-based Q&A.
    const recentHistory = history.slice(-2).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n");
    const input = `Context:\n${context}\n\nHistory:\n${recentHistory}\n\nQuestion: ${prompt}`.substring(0, 1024);
    try {
      const pipe = await this.getSummarizerPipe();
      const output = await pipe(input, {
        max_new_tokens: 150,
        min_new_tokens: 20,
        repetition_penalty: 2.0
      });
      return output[0].summary_text;
    } catch (err: any) {
      logger.error(`Local Response generation failed: ${err.message}`);
      return "Local model failed to generate response.";
    }
  }
}