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
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      if (!this.baseUrl) {
        throw new Error("Ollama URL is not configured. Please check your settings.");
      }

      const payload = {
        model: this.modelName,
        prompt: text,
      };

      requestId = debugStore.logRequest(`${this.name}:embed`, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        if (response.status === 404) {
          // Fetch available models to show in debug
          const tagsRes = await fetch(`${this.baseUrl}/api/tags`);
          const tagsData = await tagsRes.json();
          const available = tagsData.models?.map((m: any) => m.name).join(", ");
          
          const helpMsg = `Ollama model "${this.modelName}" not found. Available models: ${available || 'none'}. Please run 'ollama pull ${this.modelName}' or pick from the list.`;
          debugStore.updateError(requestId, helpMsg);
          throw new Error(helpMsg);
        }
        throw new Error(`Ollama error: ${response.statusText} - ${error}`);
      }

      const data = await response.json() as { embedding: number[] };
      debugStore.updateResponse(requestId, `[Embedding Vector: size ${data.embedding?.length || 0}]`);
      return data.embedding;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
      logger.error(`Ollama Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      const payload = {
        model: this.modelName,
        prompt: `Summarize the following code or documentation briefly and concisely:\n\n${text}`,
        stream: false,
      };

      requestId = debugStore.logRequest(`${this.name}:summarize`, this.modelName, payload);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        debugStore.updateError(requestId, error);
        if (response.status === 404) {
          throw new Error(`Ollama model "${this.modelName}" not found. Please run 'ollama pull ${this.modelName}' in your terminal.`);
        }
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      const result = data.response.trim();
      debugStore.updateResponse(requestId, result);
      return result;
    } catch (err: any) {
      if (requestId) debugStore.updateError(requestId, err.message);
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
        if (response.status === 404) {
          throw new Error(`Ollama model "${this.modelName}" not found. Please run 'ollama pull ${this.modelName}' in your terminal.`);
        }
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
