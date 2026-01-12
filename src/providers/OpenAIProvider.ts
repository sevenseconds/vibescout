import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";
import { loadConfig } from "../config.js";

export class OpenAIProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "openai";
  private modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl: string = "https://api.openai.com/v1") {
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async fillPrompt(templateName: string, placeholders: Record<string, string>) {
    const config = await loadConfig();
    let template = "";

    if (templateName === 'summarize') {
      const activeId = config.prompts?.activeSummarizeId || 'default';
      const activeTemplate = config.prompts?.summarizeTemplates?.find((t: any) => t.id === activeId);
      template = activeTemplate?.text || "";
    } else {
      template = config.prompts?.[templateName] || "";
    }
    
    // Default system fallbacks if template is empty
    if (!template) {
      if (templateName === 'summarize') template = "Summarize this code:\n\n{{code}}";
      if (templateName === 'chunkSummarize') template = "Summarize this logic block in context of {{parentName}}:\n\n{{code}}";
      if (templateName === 'bestQuestion') template = "Generate the best question for this context:\n\n{{context}}";
    }

    // Replace placeholders
    Object.entries(placeholders).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value || '');
    });

    // Add generic placeholders
    template = template.replace(/{{date}}/g, new Date().toLocaleDateString());
    template = template.replace(/{{time}}/g, new Date().toLocaleTimeString());

    return template;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      if (!this.apiKey || this.apiKey === "not-needed") {
        throw new Error(`API Key is missing for ${this.name} provider.`);
      }

      const payload = {
        model: this.modelName,
        input: text,
      };

      requestId = debugStore.logRequest(`${this.name}:embed`, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`${this.name} error: ${error}`);
      }

      const data = await response.json() as { data: [{ embedding: number[] }] };
      const result = data.data[0].embedding;
      debugStore.updateResponse(requestId, `[Embedding Vector: size ${result.length}]`);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`${this.name} Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string, options: { fileName?: string; projectName?: string; type?: 'parent' | 'chunk'; parentName?: string; promptTemplate?: string; sectionName?: string } = {}): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      if (!this.apiKey || this.apiKey === "not-needed") {
        throw new Error(`API Key is missing for ${this.name} provider.`);
      }

      // Determine which template to use
      const templateName = options.promptTemplate || (options.type === 'chunk' ? 'chunkSummarize' : 'summarize');

      // Prepare template variables
      const templateVars: any = {
        code: text,
        content: text, // For documentation
        fileName: options.fileName || 'unknown',
        projectName: options.projectName || 'unknown',
        parentName: options.parentName || 'unknown',
        sectionName: options.sectionName || ''
      };

      const prompt = await this.fillPrompt(templateName, templateVars);

      const payload = {
        model: this.modelName,
        messages: [
          { role: "system", content: "You are a helpful assistant that summarizes code and documentation concisely." },
          { role: "user", content: prompt }
        ],
        max_tokens: 250,
      };

      requestId = debugStore.logRequest(`${this.name}:summarize`, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`${this.name} error: ${error}`);
      }

      const data = await response.json() as { choices: [{ message: { content: string } }] };
      const result = data.choices[0].message.content.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`${this.name} Summarization failed: ${err.message}`);
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
        messages: [
          { role: "system", content: "You are a code architect helping a developer formulate the best question about their search results." },
          { role: "user", content: prompt }
        ],
        max_tokens: 300,
      };

      requestId = debugStore.logRequest(`${this.name}:bestQuestion`, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`${this.name} error: ${error}`);
      }

      const data = await response.json() as { choices: [{ message: { content: string } }] };
      const result = data.choices[0].message.content.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`${this.name} Best question generation failed: ${err.message}`);
      throw err;
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      if (!this.apiKey || this.apiKey === "not-needed") {
        throw new Error(`API Key is missing for ${this.name} provider.`);
      }

      // Use configurable chat template
      const historyText = history.map(m => `${m.role}: ${m.content}`).join("\n");
      const userPrompt = await this.fillPrompt('chatResponse', {
        query: prompt,
        context,
        history: historyText || "(No previous conversation)"
      });

      const messages = [
        { role: "system", content: "You are a helpful code assistant." },
        ...history.slice(-5).map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: userPrompt }
      ];

      const payload = {
        model: this.modelName,
        messages,
        max_tokens: 500,
      };

      requestId = debugStore.logRequest(this.name, this.modelName, payload);

      const url = `${this.baseUrl}/chat/completions`;
      logger.debug(`${this.name} requesting: ${url}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`${this.name} error: ${error}`);
      }

      const data = await response.json() as { choices: [{ message: { content: string } }] };
      const result = data.choices[0].message.content.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`${this.name} Response generation failed: ${err.message}`);
      throw err; // Rethrow so throttler can catch it
    }
  }
}
