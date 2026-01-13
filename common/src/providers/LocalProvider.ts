import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { pipeline } from "@huggingface/transformers";
import { logger } from "../logger.js";
import { loadConfig } from "../config.js";
import { debugStore } from "../debug.js";

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
    let template = "";

    if (templateName === 'summarize') {
      const activeId = config.prompts?.activeSummarizeId || 'default';
      const activeTemplate = config.prompts?.summarizeTemplates?.find((t: any) => t.id === activeId);
      template = activeTemplate?.text || "";
    } else if (templateName === 'docSummarize') {
      const activeId = config.prompts?.activeDocSummarizeId || 'default';
      const activeTemplate = config.prompts?.docSummarizeTemplates?.find((t: any) => t.id === activeId);
      template = activeTemplate?.text || "";
    } else {
      template = config.prompts?.[templateName] || "";
    }

    if (!template) {
      if (templateName === 'summarize') template = "Summarize this code:\n\n{{code}}";
      if (templateName === 'docSummarize') template = "Summarize this documentation:\n\n{{content}}";
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
    let requestId: string | null = null;

    try {
      requestId = debugStore.logRequest(`${this.name}:embed`, this.modelName, { text: text.substring(0, 100) + "..." });
      const pipe = await this.getEmbeddingPipe();
      const output = await pipe(text, { pooling: "mean", normalize: true });
      const result = Array.from(output.data) as any as number[];
      debugStore.updateResponse(requestId, `[Embedding Vector: size ${result.length}]`);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      throw err;
    }
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

  async summarize(text: string, options: { fileName?: string; projectName?: string; type?: 'parent' | 'chunk'; parentName?: string; promptTemplate?: string; sectionName?: string } = {}): Promise<string> {
    let requestId: string | null = null;

    try {
      const pipe = await this.getSummarizerPipe();
      const templateName = options.promptTemplate || 'summarize';

      const templateVars: any = {
        code: text,
        content: text,
        fileName: options.fileName || 'unknown',
        projectName: options.projectName || 'unknown',
        parentName: options.parentName || 'unknown',
        sectionName: options.sectionName || ''
      };

      const prompt = await this.fillPrompt(templateName, templateVars);
      
      requestId = debugStore.logRequest(`${this.name}:summarize`, this.summarizerModelName, { prompt: prompt.substring(0, 500) + "..." });

      const input = prompt.substring(0, 1024);
      const output = await pipe(input, {
        max_new_tokens: 40,
        min_new_tokens: 10,
        repetition_penalty: 2.0
      });
      const result = output[0].summary_text;
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Local Summarization failed: ${err.message}`);
      throw err;
    }
  }

  async generateBestQuestion(query: string, context: string): Promise<string> {
    let requestId: string | null = null;

    try {
      const pipe = await this.getSummarizerPipe();
      const prompt = await this.fillPrompt('bestQuestion', { query, context });
      
      requestId = debugStore.logRequest(`${this.name}:bestQuestion`, this.summarizerModelName, { prompt: prompt.substring(0, 500) + "..." });

      const input = prompt.substring(0, 1024);
      const output = await pipe(input, {
        max_new_tokens: 150,
        min_new_tokens: 20,
        repetition_penalty: 2.0
      });
      const result = output[0].summary_text;
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Local Best Question failed: ${err.message}`);
      throw err;
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    let requestId: string | null = null;

    // Local BART is mostly a summarizer, but we can try to use it for simple context-based Q&A.
    const recentHistory = history.slice(-2).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n");

    // Use configurable template, but truncate heavily since BART has 1024 token limit
    const historyText = recentHistory || "(No previous conversation)";
    const templateInput = await this.fillPrompt('chatResponse', {
      query: prompt,
      context: context.substring(0, 500), // Truncate context
      history: historyText.substring(0, 200) // Truncate history
    });

    const input = templateInput.substring(0, 1024);
    try {
      requestId = debugStore.logRequest(`${this.name}:chat`, this.summarizerModelName, { prompt: input });
      const pipe = await this.getSummarizerPipe();
      const output = await pipe(input, {
        max_new_tokens: 150,
        min_new_tokens: 20,
        repetition_penalty: 2.0
      });
      const result = output[0].summary_text;
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Local Response generation failed: ${err.message}`);
      throw err;
    }
  }
}