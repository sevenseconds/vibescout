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
    try {
      const model = this.modelName || "text-embedding-004";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text }] }
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini error: ${error}`);
      }

      const data = await response.json() as { embedding: { values: number[] } };
      return data.embedding.values;
    } catch (err: any) {
      logger.error(`Gemini Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string): Promise<string> {
    try {
      const model = this.modelName || "gemini-1.5-flash";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `Summarize this code briefly:\n\n${text}` }]
            }]
          }),
        }
      );

      if (!response.ok) throw new Error(`Gemini error: ${response.statusText}`);

      const data = await response.json() as { candidates: [{ content: { parts: [{ text: string }] } }] };
      return data.candidates[0].content.parts[0].text.trim();
    } catch (err: any) {
      logger.error(`Gemini Summarization failed: ${err.message}`);
      return "";
    }
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
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

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
        }
      );

      if (!response.ok) throw new Error(`Gemini error: ${response.statusText}`);

      const data = await response.json() as { candidates: [{ content: { parts: [{ text: string }] } }] };
      return data.candidates[0].content.parts[0].text.trim();
    } catch (err: any) {
      logger.error(`Gemini Response generation failed: ${err.message}`);
      return "Gemini failed to generate response.";
    }
  }
}
