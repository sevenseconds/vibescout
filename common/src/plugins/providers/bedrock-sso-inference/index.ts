/**
 * Bedrock SSO + Inference ARN Provider Plugin
 *
 * Provider plugin that enables AWS Bedrock LLM with SSO and inference ARN support.
 * Simpler than the AssumeRole plugin - just uses SSO credentials directly.
 */

import { ProviderPlugin, PluginContext } from "../../types.js";
import { BedrockSSOProvider } from './provider.js';

let pluginContext: PluginContext;

const plugin: ProviderPlugin = {
  name: 'bedrock-sso-inference',
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
        name: 'ssoProfile',
        type: 'text',
        label: 'SSO Profile Name',
        placeholder: 'my-sso-profile',
        required: false,
        helperText: 'AWS SSO profile name from ~/.aws/config (leave empty for default credentials)'
      },
      {
        name: 'ssoSession',
        type: 'text',
        label: 'SSO Session Name (Optional)',
        placeholder: 'my-company-sso',
        required: false,
        helperText: 'SSO session name from ~/.aws/config (optional, for SSO profiles)'
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

    return new BedrockSSOProvider({
      modelName,
      region: config.region || 'us-east-1',
      ssoProfile: config.ssoProfile,
      ssoSession: config.ssoSession
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
      console.error('[BedrockSSOPlugin] Credential validation failed:', error);
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
