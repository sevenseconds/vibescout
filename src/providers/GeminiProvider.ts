import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";
import { loadConfig } from "../config.js";

export class GeminiProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "gemini";
  private modelName: string;
  private apiKey: string;

  constructor(modelName: string, apiKey: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
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
      const model = this.modelName || "text-embedding-004";
      const payload = {
        content: { parts: [{ text }] }
      };

      requestId = debugStore.logRequest(`${this.name}:embed`, model, payload);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`Gemini error: ${error}`);
      }

      const data = await response.json() as { embedding: { values: number[] } };
      const result = data.embedding.values;
      debugStore.updateResponse(requestId, `[Embedding Vector: size ${result.length}]`);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Gemini Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string, options: { fileName?: string; projectName?: string; type?: 'parent' | 'chunk'; parentName?: string; promptTemplate?: string; sectionName?: string } = {}): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const model = this.modelName || "gemini-1.5-flash";
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
        contents: [{
          parts: [{ text: prompt }]
        }]
      };

      requestId = debugStore.logRequest(`${this.name}:summarize`, model, payload);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`Gemini error: ${error}`);
      }

      const data = await response.json() as { candidates: [{ content: { parts: [{ text: string }] } }] };
      const result = data.candidates[0].content.parts[0].text.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Gemini Summarization failed: ${err.message}`);
      throw err;
    }
  }

  async generateBestQuestion(query: string, context: string): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const model = this.modelName || "gemini-1.5-flash";
      const prompt = await this.fillPrompt('bestQuestion', { query, context });

      const payload = {
        contents: [{
          parts: [{ text: prompt }]
        }]
      };

      requestId = debugStore.logRequest(`${this.name}:bestQuestion`, model, payload);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`Gemini error: ${error}`);
      }

      const data = await response.json() as { candidates: [{ content: { parts: [{ text: string }] } }] };
      const result = data.candidates[0].content.parts[0].text.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Gemini Best Question generation failed: ${err.message}`);
      throw err;
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const model = this.modelName || "gemini-1.5-flash";

      // Use configurable chat template
      const historyText = history.map(m => `${m.role}: ${m.content}`).join("\n");
      const userPrompt = await this.fillPrompt('chatResponse', {
        query: prompt,
        context,
        history: historyText || "(No previous conversation)"
      });

      const contents = history.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      // Add current turn
      contents.push({
        role: 'user',
        parts: [{ text: userPrompt }]
      });

      const payload = { contents };
      requestId = debugStore.logRequest(this.name, model, payload);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`Gemini error: ${error}`);
      }

      const data = await response.json() as { candidates: [{ content: { parts: [{ text: string }] } }] };
      const result = data.candidates[0].content.parts[0].text.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Gemini Response generation failed: ${err.message}`);
      throw err;
    }
  }
}
