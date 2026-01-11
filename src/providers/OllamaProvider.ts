import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";

export class OllamaProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "ollama";
  private modelName: string;
  private baseUrl: string;

  constructor(modelName: string, baseUrl: string = "http://localhost:11434") {
    this.modelName = modelName;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        body: JSON.stringify({
          model: this.modelName,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json() as { embedding: number[] };
      return data.embedding;
    } catch (err: any) {
      logger.error(`Ollama Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        body: JSON.stringify({
          model: this.modelName,
          prompt: `Summarize the following code or documentation briefly and concisely:\n\n${text}`,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      return data.response.trim();
    } catch (err: any) {
      logger.error(`Ollama Summarization failed: ${err.message}`);
      return "";
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const historyText = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n");
      const fullPrompt = `You are a code assistant. Use the following context and history to answer.\n\nContext:\n${context}\n\nHistory:\n${historyText}\n\nQuestion: ${prompt}`;

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
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      const result = data.response.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Ollama Response generation failed: ${err.message}`);
      return "Ollama failed to generate response.";
    }
  }
}
