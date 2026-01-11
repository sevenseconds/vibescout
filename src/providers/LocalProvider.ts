import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { pipeline } from "@huggingface/transformers";
import { logger } from "../logger.js";
import { loadConfig } from "../config.js";

export class LocalProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "local";
  private modelName: string;
  private summarizerModelName: string = "Xenova/distilbart-cnn-6-6";
  private embeddingPipe: any = null;
  private summarizerPipe: any = null;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  private async fillPrompt(templateName: string, placeholders: Record<string, string>) {
    const config = await loadConfig();
    let template = config.prompts?.[templateName] || "";
    
    if (!template) {
      if (templateName === 'summarize') template = "Summarize this code:\n\n{{code}}";
      if (templateName === 'bestQuestion') template = "Generate the best question for this context:\n\n{{context}}";
    }

    Object.entries(placeholders).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value || '');
    });

    template = template.replace(/{{date}}/g, new Date().toLocaleDateString());
    template = template.replace(/{{time}}/g, new Date().toLocaleTimeString());

    return template;
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

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const pipe = await this.getEmbeddingPipe();

    // Transformers.js supports batch processing natively
    const output = await pipe(texts, { pooling: "mean", normalize: true });

    // Convert batch output to array of embeddings
    // Output is either 2D [batch_size, embedding_dim] or flat array
    if (output.dims && output.dims.length === 2) {
      const [batchSize, embeddingDim] = output.dims;
      return Array.from({ length: batchSize }, (_, i) => {
        const start = i * embeddingDim;
        const end = start + embeddingDim;
        return Array.from(output.data.slice(start, end));
      });
    } else {
      // Fallback: single embedding
      return [Array.from(output.data)];
    }
  }

  async summarize(text: string, options: { fileName?: string; projectName?: string } = {}): Promise<string> {
    try {
      const pipe = await this.getSummarizerPipe();
      const prompt = await this.fillPrompt('summarize', {
        code: text,
        fileName: options.fileName || 'unknown',
        projectName: options.projectName || 'unknown'
      });

      const input = prompt.substring(0, 1024);
      const output = await pipe(input, {
        max_new_tokens: 40,
        min_new_tokens: 10,
        repetition_penalty: 2.0
      });
      return output[0].summary_text;
    } catch (err: any) {
      logger.error(`Local Summarization failed: ${err.message}`);
      throw err;
    }
  }

  async generateBestQuestion(query: string, context: string): Promise<string> {
    try {
      const pipe = await this.getSummarizerPipe();
      const prompt = await this.fillPrompt('bestQuestion', { query, context });
      const input = prompt.substring(0, 1024);
      const output = await pipe(input, {
        max_new_tokens: 150,
        min_new_tokens: 20,
        repetition_penalty: 2.0
      });
      return output[0].summary_text;
    } catch (err: any) {
      logger.error(`Local Best Question failed: ${err.message}`);
      throw err;
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
      throw err;
    }
  }
}