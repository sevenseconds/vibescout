/**
 * Bedrock Access Keys + Inference ARN Provider Plugin
 *
 * Provider plugin that enables AWS Bedrock LLM with access keys and inference ARN support.
 * Uses AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY or explicit credentials.
 */

import { ProviderPlugin, PluginContext } from "../../types.js";
import { BedrockInferenceProvider } from './provider.js';

let pluginContext: PluginContext;

const plugin: ProviderPlugin = {
  name: 'bedrock-inference',
  type: 'llm',

  // Configuration schema for dynamic UI generation
  configSchema: {
    fields: [
      {
        name: 'inferenceArn',
        type: 'arn',
        label: 'Inference Model ARN',
        placeholder: 'arn:aws:bedrock:us-east-1:999999999999:endpoint/custom-llm',
        required: false,
        helperText: 'Custom Bedrock inference model ARN (leave empty to use model name)'
      },
      {
        name: 'modelName',
        type: 'text',
        label: 'Model Name (if not using ARN)',
        placeholder: 'anthropic.claude-3-sonnet-20240229-v1:0',
        required: false,
        helperText: 'Bedrock model ID (e.g., anthropic.claude-3-sonnet-20240229-v1:0)'
      },
      {
        name: 'region',
        type: 'region',
        label: 'AWS Region',
        placeholder: 'us-east-1',
        required: true,
        helperText: 'AWS region for Bedrock'
      },
      {
        name: 'accessKeyId',
        type: 'text',
        label: 'AWS Access Key ID',
        placeholder: 'AKIAIOSFODNN7EXAMPLE',
        required: false,
        helperText: 'AWS access key ID (leave empty to use AWS_ACCESS_KEY_ID env var)'
      },
      {
        name: 'secretAccessKey',
        type: 'password',
        label: 'AWS Secret Access Key',
        placeholder: '••••••••••••••••',
        required: false,
        helperText: 'AWS secret access key (leave empty to use AWS_SECRET_ACCESS_KEY env var)'
      },
      {
        name: 'sessionToken',
        type: 'text',
        label: 'AWS Session Token (Optional)',
        placeholder: '',
        required: false,
        helperText: 'AWS session token for temporary credentials (optional)'
      }
    ]
  },

  /**
   * Initialize the plugin and register as provider
   */
  initialize(context: PluginContext) {
    pluginContext = context;
    context.registerProvider(this);
  },

  /**
   * Create a new provider instance
   */
  createProvider(config: any) {
    // Use inference ARN if provided, otherwise use model name
    const modelName = config.inferenceArn || config.modelName || 'anthropic.claude-3-sonnet-20240229-v1:0';

    return new BedrockInferenceProvider({
      modelName,
      region: config.region || 'us-east-1',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken
    }, pluginContext?.debugStore);
  },

  /**
   * Validate credentials
   */
  async validateCredentials(config: any): Promise<boolean> {
    try {
      const provider = this.createProvider!(config);
      return await provider.testConnection();
    } catch (error) {
      console.error('[BedrockInferencePlugin] Credential validation failed:', error);
      return false;
    }
  },

  /**
   * Test connection with given configuration
   */
  async testConnection(config: any): Promise<void> {
    const provider = this.createProvider!(config);
    const success = await provider.testConnection();

    if (!success) {
      throw new Error('Connection test failed. Please check your credentials and configuration.');
    }
  }
};

export default plugin;
