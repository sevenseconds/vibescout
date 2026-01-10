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
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.modelName || "@cf/baai/bge-small-en-v1.5"}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiToken}` },
          body: JSON.stringify({ text: [text] }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloudflare error: ${error}`);
      }

      const data = await response.json() as { result: { data: number[][] } };
      return data.result.data[0];
    } catch (err: any) {
      logger.error(`Cloudflare Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string): Promise<string> {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.modelName || "@cf/meta/llama-3-8b-instruct"}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiToken}` },
          body: JSON.stringify({
            messages: [
              { role: "system", content: "Summarize this code concisely." },
              { role: "user", content: text }
            ]
          }),
        }
      );

      if (!response.ok) throw new Error(`Cloudflare error: ${response.statusText}`);

      const data = await response.json() as { result: { response: string } };
      return data.result.response.trim();
    } catch (err: any) {
      logger.error(`Cloudflare Summarization failed: ${err.message}`);
      return "";
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    try {
      const messages = [
        { role: "system", content: "You are a code assistant. Answer using the provided context and conversation history." },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${prompt}` }
      ];

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.modelName || "@cf/meta/llama-3-8b-instruct"}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiToken}` },
          body: JSON.stringify({ messages }),
        }
      );

      if (!response.ok) throw new Error(`Cloudflare error: ${response.statusText}`);

      const data = await response.json() as { result: { response: string } };
      return data.result.response.trim();
    } catch (err: any) {
      logger.error(`Cloudflare Response generation failed: ${err.message}`);
      return "Cloudflare failed to generate response.";
    }
  }
}
