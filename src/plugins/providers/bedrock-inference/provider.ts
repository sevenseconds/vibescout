/**
 * Bedrock LLM Provider with Access Keys and Inference ARN Support
 *
 * This provider provides:
 * - AWS access key credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * - Custom inference ARN support
 * - Standard Bedrock model support
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';
import {
  ListFoundationModelsCommand
} from '@aws-sdk/client-bedrock';
import { fromEnv } from '@aws-sdk/credential-providers';

export interface BedrockInferenceOptions {
  modelName: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export class BedrockInferenceProvider {
  private client: BedrockRuntimeClient;
  private modelName: string;
  private region: string;

  constructor(options: BedrockInferenceOptions) {
    const {
      modelName,
      region = 'us-east-1',
      accessKeyId,
      secretAccessKey,
      sessionToken
    } = options;

    this.modelName = modelName;
    this.region = region;

    // Build credential provider
    let credentials;

    if (accessKeyId && secretAccessKey) {
      // Use explicit credentials from config
      console.log(`[BedrockInferenceProvider] Using explicit access keys`);

      // Pass credentials directly as object
      credentials = {
        accessKeyId,
        secretAccessKey,
        sessionToken
      };
    } else {
      // Use environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
      console.log(`[BedrockInferenceProvider] Using environment variables`);
      credentials = fromEnv();
    }

    this.client = new BedrockRuntimeClient({
      region,
      credentials
    });
  }

  get name() {
    return 'bedrock-inference';
  }

  /**
   * Summarize text using the LLM
   */
  async summarize(text: string, maxLength?: number): Promise<string> {
    try {
      const prompt = maxLength
        ? `Summarize the following text in ${maxLength} characters or less:\n\n${text}`
        : `Summarize the following text concisely:\n\n${text}`;

      const response = await this.callBedrock(prompt);
      return response;
    } catch (error) {
      console.error('[BedrockInferenceProvider] Error in summarize:', error);
      throw error;
    }
  }

  /**
   * Generate the best question for a code block
   */
  async generateBestQuestion(code: string, summary: string): Promise<string> {
    try {
      const prompt = `Given this code summary:\n${summary}\n\nAnd this code:\n${code}\n\nGenerate the single best question that would help understand this code. Return only the question, no explanation.`;

      const response = await this.callBedrock(prompt);
      return response;
    } catch (error) {
      console.error('[BedrockInferenceProvider] Error in generateBestQuestion:', error);
      throw error;
    }
  }

  /**
   * Generate a response from a prompt with context
   */
  async generateResponse(prompt: string, context?: string): Promise<string> {
    try {
      const fullPrompt = context
        ? `Context:\n${context}\n\nQuestion:\n${prompt}\n\nProvide a helpful answer based on the context above.`
        : prompt;

      const response = await this.callBedrock(fullPrompt);
      return response;
    } catch (error) {
      console.error('[BedrockInferenceProvider] Error in generateResponse:', error);
      throw error;
    }
  }

  /**
   * Test connection by listing available models
   */
  async testConnection(): Promise<boolean> {
    try {
      const command = new ListFoundationModelsCommand({});
      await this.client.send(command);
      console.log('[BedrockInferenceProvider] Connection test successful');
      return true;
    } catch (error) {
      console.error('[BedrockInferenceProvider] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Call Bedrock with the given prompt
   */
  private async callBedrock(prompt: string): Promise<string> {
    // Determine model ID (can be model name or inference ARN)
    const modelId = this.modelName;

    // Build request based on model
    let requestBody: any;

    if (modelId.includes('anthropic')) {
      // Claude format
      requestBody = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: prompt
        }]
      };
    } else if (modelId.includes('ai21')) {
      // Jurassic format
      requestBody = {
        maxTokens: 1024,
        prompt: prompt
      };
    } else if (modelId.includes('amazon')) {
      // Titan format
      requestBody = {
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: 1024
        }
      };
    } else {
      // Generic format (for custom/inference ARNs)
      requestBody = {
        prompt: prompt,
        max_tokens: 1024
      };
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract text from response based on model
    if (responseBody.completion) {
      return responseBody.completion;
    } else if (responseBody.outputText) {
      return responseBody.outputText;
    } else if (responseBody.message?.content) {
      if (Array.isArray(responseBody.message.content)) {
        return responseBody.message.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
      }
      return responseBody.message.content;
    } else if (responseBody.choices?.[0]?.message?.content) {
      return responseBody.choices[0].message.content;
    }

    console.warn('[BedrockInferenceProvider] Unexpected response format:', responseBody);
    return JSON.stringify(responseBody);
  }
}
