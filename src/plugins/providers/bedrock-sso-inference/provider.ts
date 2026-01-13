/**
 * Bedrock LLM Provider with SSO and Inference ARN Support
 *
 * This provider provides:
 * - AWS SSO credential integration
 * - Custom inference ARN support
 * - Standard Bedrock model support
 */

import { fromIni } from '@aws-sdk/credential-providers';
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';
import {
  ListFoundationModelsCommand
} from '@aws-sdk/client-bedrock';

export interface BedrockSSOOptions {
  modelName: string;
  region: string;
  ssoProfile?: string;
  ssoSession?: string;
}

export class BedrockSSOProvider {
  private client: BedrockRuntimeClient;
  private modelName: string;
  private region: string;
  private debugStore: any;

  constructor(options: BedrockSSOOptions, debugStore?: any) {
    const {
      modelName,
      region = 'us-east-1',
      ssoProfile,
      ssoSession
    } = options;

    this.modelName = modelName;
    this.region = region;
    this.debugStore = debugStore;

    // Build credential provider for SSO profile
    let credentials;

    if (ssoProfile) {
      console.log(`[BedrockSSOProvider] Using SSO profile: ${ssoProfile}`);

      credentials = fromIni({
        profile: ssoProfile
      });
    } else {
      // Default credential chain (env vars, ~/.aws/credentials, IAM roles)
      console.log(`[BedrockSSOProvider] Using default credential chain`);
      credentials = fromIni();
    }

    this.client = new BedrockRuntimeClient({
      region,
      credentials
    });
  }

  get name() {
    return 'bedrock-sso-inference';
  }

  /**
   * Summarize text using the LLM
   */
  async summarize(text: string, maxLength?: number): Promise<string> {
    let requestId: string | null = null;
    try {
      const prompt = maxLength
        ? `Summarize the following text in ${maxLength} characters or less:\n\n${text}`
        : `Summarize the following text concisely:\n\n${text}`;

      if (this.debugStore) {
        requestId = this.debugStore.logRequest(`${this.name}:summarize`, this.modelName, { prompt: prompt.substring(0, 500) + "..." });
      }

      const response = await this.callBedrock(prompt);

      if (requestId && this.debugStore) {
        this.debugStore.updateResponse(requestId, response);
      }

      return response;
    } catch (error: any) {
      if (requestId && this.debugStore) {
        this.debugStore.updateError(requestId, error.message);
      }
      console.error('[BedrockSSOProvider] Error in summarize:', error);
      throw error;
    }
  }

  /**
   * Generate the best question for a code block
   */
  async generateBestQuestion(code: string, summary: string): Promise<string> {
    let requestId: string | null = null;
    try {
      const prompt = `Given this code summary:\n${summary}\n\nAnd this code:\n${code}\n\nGenerate the single best question that would help understand this code. Return only the question, no explanation.`;

      if (this.debugStore) {
        requestId = this.debugStore.logRequest(`${this.name}:bestQuestion`, this.modelName, { prompt: prompt.substring(0, 500) + "..." });
      }

      const response = await this.callBedrock(prompt);

      if (requestId && this.debugStore) {
        this.debugStore.updateResponse(requestId, response);
      }

      return response;
    } catch (error: any) {
      if (requestId && this.debugStore) {
        this.debugStore.updateError(requestId, error.message);
      }
      console.error('[BedrockSSOProvider] Error in generateBestQuestion:', error);
      throw error;
    }
  }

  /**
   * Generate a response from a prompt with context
   */
  async generateResponse(prompt: string, context?: string): Promise<string> {
    let requestId: string | null = null;
    try {
      const fullPrompt = context
        ? `Context:\n${context}\n\nQuestion:\n${prompt}\n\nProvide a helpful answer based on the context above.`
        : prompt;

      if (this.debugStore) {
        requestId = this.debugStore.logRequest(`${this.name}:chat`, this.modelName, { prompt: fullPrompt.substring(0, 500) + "..." });
      }

      const response = await this.callBedrock(fullPrompt);

      if (requestId && this.debugStore) {
        this.debugStore.updateResponse(requestId, response);
      }

      return response;
    } catch (error: any) {
      if (requestId && this.debugStore) {
        this.debugStore.updateError(requestId, error.message);
      }
      console.error('[BedrockSSOProvider] Error in generateResponse:', error);
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
      console.log('[BedrockSSOProvider] Connection test successful');
      return true;
    } catch (error) {
      console.error('[BedrockSSOProvider] Connection test failed:', error);
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

    console.warn('[BedrockSSOProvider] Unexpected response format:', responseBody);
    return JSON.stringify(responseBody);
  }
}
