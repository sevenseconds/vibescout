import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { logger } from "../logger.js";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";

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

  private async fillPrompt(templateName: string, placeholders: Record<string, string>) {
    const { loadConfig } = await import("../config.js");
    const config = await loadConfig();
    let template = "";

    if (templateName === 'summarize') {
      const activeId = config.prompts?.activeSummarizeId || 'default';
      const activeTemplate = config.prompts?.summarizeTemplates?.find((t: any) => t.id === activeId);
      template = activeTemplate?.text || "";
    } else {
      template = config.prompts?.[templateName] || "";
    }

    if (!template) {
      if (templateName === 'summarize') template = "Summarize this code:\n\n{{code}}";
      if (templateName === 'chunkSummarize') template = "Summarize this logic block in context of {{parentName}}:\n\n{{code}}";
      if (templateName === 'bestQuestion') template = "Generate the best question for this context:\n\n{{context}}";
      if (templateName === 'chatResponse') template = "You are a code assistant.\n\nContext:\n{{context}}\n\nQuestion: {{query}}";
    }

    Object.entries(placeholders).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value || '');
    });

    template = template.replace(/{{date}}/g, new Date().toLocaleDateString());
    template = template.replace(/{{time}}/g, new Date().toLocaleTimeString());

    return template;
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

  async summarize(text: string, options: { fileName?: string; projectName?: string; type?: 'parent' | 'chunk'; parentName?: string; promptTemplate?: string; sectionName?: string } = {}): Promise<string> {
    const { debugStore } = await import("../debug.js");
    let requestId: string | null = null;

    try {
      // Determine which template to use
      const templateName = options.promptTemplate || (options.type === 'chunk' ? 'chunkSummarize' : 'summarize');

      // Prepare template variables
      const templateVars: any = {
        code: text,
        content: text, // For documentation
        fileName: options.fileName || 'unknown',
        projectName: options.projectName || 'unknown',
        parentName: options.parentName || 'unknown',
        sectionName: options.sectionName || ''
      };

      const prompt = await this.fillPrompt(templateName, templateVars);

      // Formulate the message for Bedrock
      const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 250,
        messages: [
          { role: "user", content: prompt }
        ]
      });

      requestId = debugStore?.logRequest?.(`${this.name}:summarize`, this.modelName, body);

      const command = new InvokeModelCommand({
        modelId: this.modelName,
        contentType: "application/json",
        accept: "application/json",
        body
      });

      const response = await this.client.send(command);
      const data = JSON.parse(new TextDecoder().decode(response.body));
      const result = data.content ? data.content[0].text : data.generation || data.results[0].outputText;

      if (debugStore) debugStore.updateResponse(requestId, result);
      return result.trim();
    } catch (err: any) {
      if (requestId && debugStore) debugStore.updateError(requestId, err.message);
      logger.error(`Bedrock Summarization failed: ${err.message}`);
      throw err;
    }
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
