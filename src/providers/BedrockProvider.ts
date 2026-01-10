import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-provider-node";

export class BedrockProvider implements EmbeddingProvider, SummarizerProvider {
  name: string = "bedrock";
  private client: BedrockRuntimeClient;
  private modelName: string;

  constructor(modelName: string, region: string, profile?: string) {
    this.modelName = modelName;
    const config: any = { region };
    
    if (profile) {
      config.credentials = fromIni({ profile });
    }

    this.client = new BedrockRuntimeClient(config);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Support for Amazon Titan or Cohere models
      const isTitan = this.modelName.includes("titan");
      const body = isTitan 
        ? JSON.stringify({ inputText: text })
        : JSON.stringify({ texts: [text], input_type: "search_document" });

      const command = new InvokeModelCommand({
        modelId: this.modelName,
        contentType: "application/json",
        accept: "application/json",
        body
      });

      const response = await this.client.send(command);
      const data = JSON.parse(new TextDecoder().decode(response.body));

      return isTitan ? data.embedding : data.embeddings[0];
    } catch (err: any) {
      logger.error(`Bedrock Embedding failed: ${err.message}`);
      throw err;
    }
  }

  async summarize(text: string): Promise<string> {
    return this.generateResponse(`Summarize the following code concisely:\n\n${text}`, "");
  }

  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    try {
      // Formulate prompt for Claude or Llama on Bedrock
      const historyText = history.map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`).join("\n\n");
      const fullPrompt = `Context:\n${context}\n\n${historyText}\n\nHuman: ${prompt}\n\nAssistant:`;

      // Assuming Claude 3 / Llama 3 format for simplicity
      const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 500,
        messages: [
          { role: "user", content: `Context:\n${context}\n\nQuestion: ${prompt}` }
        ]
      });

      // Note: Bedrock body formats vary by model. 
      // This implementation defaults to Claude 3 Messages API style.
      const command = new InvokeModelCommand({
        modelId: this.modelName,
        contentType: "application/json",
        accept: "application/json",
        body
      });

      const response = await this.client.send(command);
      const data = JSON.parse(new TextDecoder().decode(response.body));

      return data.content ? data.content[0].text : data.generation || data.results[0].outputText;
    } catch (err: any) {
      logger.error(`Bedrock Response failed: ${err.message}`);
      return "Bedrock failed to generate response.";
    }
  }
}
