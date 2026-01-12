export interface EmbeddingProvider {
  name: string;
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddingsBatch?(texts: string[]): Promise<number[][]>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SummarizerProvider {
  name: string;
  summarize(text: string, options?: { fileName?: string; projectName?: string; type?: 'parent' | 'chunk'; parentName?: string; promptTemplate?: string; sectionName?: string }): Promise<string>;
  generateBestQuestion(query: string, context: string): Promise<string>;
  generateResponse(prompt: string, context: string, history?: ChatMessage[]): Promise<string>;
}

export interface ProviderConfig {
  type: 'local' | 'ollama' | 'openai' | 'cloudflare' | 'gemini' | 'zai' | 'bedrock';
  modelName: string;
  baseUrl?: string;
  apiKey?: string;
  accountId?: string;
  awsRegion?: string;
  awsProfile?: string;
}
