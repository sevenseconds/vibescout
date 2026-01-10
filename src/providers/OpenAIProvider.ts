import { EmbeddingProvider, SummarizerProvider } from "./base.js";
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
        throw new Error(`OpenAI error: ${error}`);
      }

      const data = await response.json() as { data: [{ embedding: number[] }] };
      return data.data[0].embedding;
    } catch (err: any) {
      logger.error(`OpenAI Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string): Promise<string> {
    try {
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
        throw new Error(`OpenAI error: ${error}`);
      }

      const data = await response.json() as { choices: [{ message: { content: string } }] };
      return data.choices[0].message.content.trim();
    } catch (err: any) {
      logger.error(`OpenAI Summarization failed: ${err.message}`);
      return "";
    }
  }
}
