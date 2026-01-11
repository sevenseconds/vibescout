import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";

export class GeminiProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "gemini";
  private modelName: string;
  private apiKey: string;

  constructor(modelName: string, apiKey: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
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

  async summarize(text: string): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const model = this.modelName || "gemini-1.5-flash";
      const payload = {
        contents: [{
          parts: [{ text: `Summarize this code briefly:\n\n${text}` }]
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

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const model = this.modelName || "gemini-1.5-flash";
      const contents = history.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      // Add current turn
      contents.push({
        role: 'user',
        parts: [{ text: `Use the following code context to answer the question.\n\nContext:\n${context}\n\nQuestion: ${prompt}` }]
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
