import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";
import { loadConfig } from "../config.js";

export class OllamaProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "ollama";
  private modelName: string;
  private baseUrl: string;

  constructor(modelName: string, baseUrl: string = "http://localhost:11434") {
    this.modelName = modelName;
    this.baseUrl = baseUrl.replace(/\/$/, "");
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
      if (templateName === 'chunkSummarize') template = "Summarize this logic block in context of {{parentName}}:\n\n{{code}}";
      if (templateName === 'bestQuestion') template = "Generate the best question for this context:\n\n{{context}}";
      if (templateName === 'chatResponse') template = "You are a code assistant.\n\nContext:\n{{context}}\n\nQuestion: {{query}}";
    }

    Object.entries(placeholders).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value || '');
    });

    template = template.replace(/{{date}}/g, new Date().toLocaleDateString());
    template = template.replace(/{{time}}/g, new Date().toLocaleTimeString());

    return template;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      if (!this.baseUrl) {
        throw new Error("Ollama URL is not configured. Please check your settings.");
      }

      const payload = {
        model: this.modelName,
        prompt: text,
      };

      requestId = debugStore.logRequest(`${this.name}:embed`, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        if (response.status === 404) {
          // Fetch available models to show in debug
          const tagsRes = await fetch(`${this.baseUrl}/api/tags`);
          const tagsData = await tagsRes.json();
          const available = tagsData.models?.map((m: any) => m.name).join(", ");
          
          const helpMsg = `Ollama model "${this.modelName}" not found. Available models: ${available || 'none'}. Please run 'ollama pull ${this.modelName}' or pick from the list.`;
          debugStore.updateError(requestId, helpMsg);
          throw new Error(helpMsg);
        }
        throw new Error(`Ollama error: ${response.statusText} - ${error}`);
      }

      const data = await response.json() as { embedding: number[] };
      debugStore.updateResponse(requestId, `[Embedding Vector: size ${data.embedding?.length || 0}]`);
      return data.embedding;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Ollama Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string, options: { fileName?: string; projectName?: string; type?: 'parent' | 'chunk'; parentName?: string; promptTemplate?: string; sectionName?: string } = {}): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const templateName = options.promptTemplate || (options.type === 'chunk' ? 'chunkSummarize' : 'summarize');
      const prompt = await this.fillPrompt(templateName, {
        code: text,
        content: text, // For documentation
        fileName: options.fileName || 'unknown',
        projectName: options.projectName || 'unknown',
        parentName: options.parentName || 'unknown',
        sectionName: options.sectionName || ''
      });

      const payload = {
        model: this.modelName,
        prompt,
        stream: false,
      };

      requestId = debugStore.logRequest(`${this.name}:summarize`, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        if (response.status === 404) {
          throw new Error(`Ollama model "${this.modelName}" not found. Please run 'ollama pull ${this.modelName}' in your terminal.`);
        }
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      const result = data.response.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Ollama Summarization failed: ${err.message}`);
      throw err;
    }
  }

  async generateBestQuestion(query: string, context: string): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const prompt = await this.fillPrompt('bestQuestion', { query, context });

      const payload = {
        model: this.modelName,
        prompt,
        stream: false,
      };

      requestId = debugStore.logRequest(`${this.name}:bestQuestion`, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        if (response.status === 404) {
          throw new Error(`Ollama model "${this.modelName}" not found. Please run 'ollama pull ${this.modelName}' in your terminal.`);
        }
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      const result = data.response.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Ollama Best Question generation failed: ${err.message}`);
      throw err;
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      // Use configurable chat template
      const historyText = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n");
      const fullPrompt = await this.fillPrompt('chatResponse', {
        query: prompt,
        context,
        history: historyText || "(No previous conversation)"
      });

      const payload = {
        model: this.modelName,
        prompt: fullPrompt,
        stream: false,
      };

      requestId = debugStore.logRequest(this.name, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        if (response.status === 404) {
          throw new Error(`Ollama model "${this.modelName}" not found. Please run 'ollama pull ${this.modelName}' in your terminal.`);
        }
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      const result = data.response.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Ollama Response generation failed: ${err.message}`);
      throw err;
    }
  }
}
