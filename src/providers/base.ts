export interface EmbeddingProvider {
  name: string;
  generateEmbedding(text: string): Promise<number[]>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SummarizerProvider {
  name: string;
  summarize(text: string): Promise<string>;
  generateResponse(prompt: string, context: string, history?: ChatMessage[]): Promise<string>;
}

export interface ProviderConfig {
  type: 'local' | 'ollama' | 'openai' | 'cloudflare' | 'gemini';
  modelName: string;
  baseUrl?: string;
  apiKey?: string;
  accountId?: string;
}
