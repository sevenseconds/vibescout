import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";

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

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!this.apiKey || this.apiKey === "not-needed") {
        throw new Error(`API Key is missing for ${this.name} provider.`);
      }

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          input: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${this.name} error: ${error}`);
      }

      const data = await response.json() as { data: [{ embedding: number[] }] };
      return data.data[0].embedding;
    } catch (err: any) {
      logger.error(`${this.name} Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string): Promise<string> {
    try {
      if (!this.apiKey || this.apiKey === "not-needed") {
        throw new Error(`API Key is missing for ${this.name} provider.`);
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            { role: "system", content: "You are a helpful assistant that summarizes code and documentation concisely." },
            { role: "user", content: `Summarize this briefly:\n\n${text}` }
          ],
          max_tokens: 150,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${this.name} error: ${error}`);
      }

      const data = await response.json() as { choices: [{ message: { content: string } }] };
      return data.choices[0].message.content.trim();
    } catch (err: any) {
      logger.error(`${this.name} Summarization failed: ${err.message}`);
      return "";
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      if (!this.apiKey || this.apiKey === "not-needed") {
        throw new Error(`API Key is missing for ${this.name} provider.`);
      }

      const messages = [
        { role: "system", content: "You are a code assistant. Answer questions based on the provided code context and conversation history." },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${prompt}` }
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
      return `${this.name} failed to generate response.`;
    }
  }
}
