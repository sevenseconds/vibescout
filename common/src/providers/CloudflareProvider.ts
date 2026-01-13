import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";
import { loadConfig } from "../config.js";
import { debugStore } from "../debug.js";

export class CloudflareProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "cloudflare";
  private modelName: string;
  private accountId: string;
  private apiToken: string;

  constructor(modelName: string, accountId: string, apiToken: string) {
    this.modelName = modelName;
    this.accountId = accountId;
    this.apiToken = apiToken;
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
      if (templateName === 'chatResponse') template = "You are a code assistant.\n\nContext:\n{{context}}\n\nQuestion: {{query}}";
      if (templateName === 'summarize') template = "Summarize this code:\n\n{{code}}";
      if (templateName === 'docSummarize') template = "Summarize this documentation:\n\n{{content}}";
      if (templateName === 'chunkSummarize') template = "Summarize this logic block in context of {{parentName}}:\n\n{{code}}";
      if (templateName === 'bestQuestion') template = "Generate the best question:\n\n{{context}}";
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
    let requestId: string | null = null;
    const model = this.modelName || "@cf/baai/bge-small-en-v1.5";

    try {
      const payload = { text: [text] };
      requestId = debugStore.logRequest(`${this.name}:embed`, model, payload);

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiToken}` },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`Cloudflare error: ${error}`);
      }

      const data = await response.json() as { result: { data: number[][] } };
      const result = data.result.data[0];
      debugStore.updateResponse(requestId, `[Embedding Vector: size ${result.length}]`);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Cloudflare Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string, options: { fileName?: string; projectName?: string; type?: 'parent' | 'chunk'; parentName?: string; promptTemplate?: string; sectionName?: string } = {}): Promise<string> {
    let requestId: string | null = null;
    const model = this.modelName || "@cf/meta/llama-3-8b-instruct";

    try {
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
        messages: [
          { role: "system", content: "You are a helpful assistant that summarizes code and documentation concisely." },
          { role: "user", content: prompt }
        ]
      };

      requestId = debugStore.logRequest(`${this.name}:summarize`, model, payload);

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiToken}` },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`Cloudflare error: ${error}`);
      }

      const data = await response.json() as { result: { response: string } };
      const result = data.result.response.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Cloudflare Summarization failed: ${err.message}`);
      return "";
    }
  }

  async generateBestQuestion(query: string, context: string): Promise<string> {
    let requestId: string | null = null;
    const model = this.modelName || "@cf/meta/llama-3-8b-instruct";

    try {
      const prompt = await this.fillPrompt('bestQuestion', { query, context });

      const payload = {
        messages: [
          { role: "system", content: "You are a code architect helping a developer formulate the best question about their search results." },
          { role: "user", content: prompt }
        ]
      };

      requestId = debugStore.logRequest(`${this.name}:bestQuestion`, model, payload);

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiToken}` },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`Cloudflare error: ${error}`);
      }

      const data = await response.json() as { result: { response: string } };
      const result = data.result.response.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Cloudflare Best question generation failed: ${err.message}`);
      return "";
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    let requestId: string | null = null;
    const model = this.modelName || "@cf/meta/llama-3-8b-instruct";

    try {
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

      const payload = { messages };
      requestId = debugStore.logRequest(this.name, model, payload);

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiToken}` },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        throw new Error(`Cloudflare error: ${error}`);
      }

      const data = await response.json() as { result: { response: string } };
      const result = data.result.response.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Cloudflare Response generation failed: ${err.message}`);
      return "Cloudflare failed to generate response.";
    }
  }
}
