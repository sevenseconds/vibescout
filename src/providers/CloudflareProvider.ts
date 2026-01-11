import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";

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

  async generateEmbedding(text: string): Promise<number[]> {
    const { debugStore } = await import("../debug.js");
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

  async summarize(text: string): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;
    const model = this.modelName || "@cf/meta/llama-3-8b-instruct";

    try {
      const payload = {
        messages: [
          { role: "system", content: "Summarize this code concisely." },
          { role: "user", content: text }
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

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;
    const model = this.modelName || "@cf/meta/llama-3-8b-instruct";

    try {
      const messages = [
        { role: "system", content: "You are a code assistant. Answer using the provided context and conversation history." },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${prompt}` }
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
