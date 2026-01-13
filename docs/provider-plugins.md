# Provider Plugin System

VibeScout's provider plugin system allows you to create custom AI provider implementations with your own authentication logic, configuration, and capabilities. This is particularly useful for:

- Custom authentication flows (e.g., AWS AssumeRole, SSO, OAuth)
- Proprietary inference endpoints
- Custom model configurations
- Organization-specific credential management

## Overview

VibeScout supports two types of providers:
- **Embedding Providers**: Generate vector embeddings for code search
- **LLM Providers**: Handle summarization, chat, and code understanding

Provider plugins can extend either or both of these capabilities.

## Plugin Architecture

### Directory Structure

```
vibescout/
├── src/plugins/
│   └── providers/                    # Built-in provider plugins
│       ├── bedrock-inference/
│       │   ├── package.json
│       │   ├── index.ts            # Plugin definition
│       │   └── provider.ts         # Provider implementation
│       └── bedrock-llm-assume-role/
│           ├── package.json
│           ├── index.ts
│           └── provider.ts
│
└── ~/.vibescout/                     # User plugins (in your home directory)
    └── plugins/
        └── providers/               # User provider plugins
            └── my-custom-provider/
                ├── package.json
                ├── index.ts
                └── provider.ts
```

### Plugin Lifecycle

1. **Discovery**: VibeScout scans `src/plugins/providers/` and `~/.vibescout/plugins/providers/`
2. **Loading**: Plugins are loaded based on their `package.json` manifest
3. **Registration**: Plugins register themselves as providers via `context.registerProvider()`
4. **Configuration**: UI dynamically generates forms from the plugin's config schema
5. **Usage**: VibeScout calls the provider's methods to perform AI operations

## Creating a Provider Plugin

### Step 1: Create Plugin Directory

```bash
mkdir -p ~/.vibescout/plugins/providers/my-provider
cd ~/.vibescout/plugins/providers/my-provider
```

### Step 2: Create package.json

```json
{
  "name": "my-provider",
  "version": "1.0.0",
  "description": "My custom LLM provider",
  "main": "index.ts",
  "type": "module",
  "vibescout": {
    "type": "provider",
    "providerType": "llm",
    "apiVersion": "1.0.0",
    "builtin": false,
    "capabilities": ["providers"]
  },
  "dependencies": {
    "@aws-sdk/client-bedrock-runtime": "^3.0.0"
  }
}
```

**Required fields:**
- `type`: Must be `"provider"`
- `providerType`: Either `"embedding"` or `"llm"`
- `apiVersion`: Plugin API version (currently `"1.0.0"`)

### Step 3: Implement the Provider Class

Create `provider.ts` with your provider implementation:

```typescript
import { LLMProvider } from '../../../src/providers/base.js';

export interface MyProviderOptions {
  apiKey: string;
  model: string;
  region: string;
}

export class MyProvider implements LLMProvider {
  private client: any;
  private model: string;

  constructor(options: MyProviderOptions) {
    this.model = options.model;
    this.client = this.initializeClient(options);
  }

  get name() {
    return 'my-provider';
  }

  async summarize(text: string, maxLength?: number): Promise<string> {
    // Implement summarization
    const response = await this.client.generate({
      model: this.model,
      prompt: `Summarize: ${text}`,
      maxTokens: maxLength || 500
    });
    return response.text;
  }

  async generateBestQuestion(code: string, summary: string): Promise<string> {
    // Generate the best question for a code block
    const response = await this.client.generate({
      model: this.model,
      prompt: `Given this summary: ${summary}\nCode: ${code}\nWhat question would help understand this?`
    });
    return response.text;
  }

  async generateResponse(prompt: string, context?: string): Promise<string> {
    // Generate a chat response
    const response = await this.client.generate({
      model: this.model,
      prompt: context ? `${context}\n\n${prompt}` : prompt
    });
    return response.text;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.listModels();
      return true;
    } catch {
      return false;
    }
  }

  private initializeClient(options: MyProviderOptions) {
    // Initialize your AI client here
    return {
      generate: async ({ model, prompt, maxTokens }) => {
        // Call your AI service
      },
      listModels: async () => {
        // List available models
      }
    };
  }
}
```

### Step 4: Create Plugin Definition

Create `index.ts` to define the plugin:

```typescript
import { ProviderPlugin, PluginContext } from '../../../src/plugins/types.js';
import { MyProvider } from './provider.js';

const plugin: ProviderPlugin = {
  name: 'my-provider',
  version: '1.0.0',
  apiVersion: '1.0.0',
  type: 'llm',

  // Configuration schema for dynamic UI generation
  configSchema: {
    fields: [
      {
        name: 'apiKey',
        type: 'password',
        label: 'API Key',
        placeholder: '••••••••••••••••',
        required: true,
        helperText: 'Your API key for the service'
      },
      {
        name: 'model',
        type: 'text',
        label: 'Model Name',
        placeholder: 'gpt-4',
        required: true,
        helperText: 'The model to use for inference'
      },
      {
        name: 'region',
        type: 'select',
        label: 'Region',
        required: true,
        options: [
          { label: 'US East', value: 'us-east-1' },
          { label: 'EU West', value: 'eu-west-1' }
        ],
        helperText: 'Select the region'
      }
    ]
  },

  // Initialize the plugin and register as provider
  initialize(context: PluginContext) {
    context.registerProvider(this);
  },

  // Create a provider instance with given config
  createProvider(config: any) {
    return new MyProvider({
      apiKey: config.apiKey,
      model: config.model,
      region: config.region
    });
  },

  // Validate credentials (optional)
  async validateCredentials(config: any): Promise<boolean> {
    try {
      const provider = this.createProvider!(config);
      return await provider.testConnection();
    } catch {
      return false;
    }
  },

  // Test connection (optional)
  async testConnection(config: any): Promise<void> {
    const provider = this.createProvider!(config);
    const success = await provider.testConnection();
    if (!success) {
      throw new Error('Connection test failed');
    }
  }
};

export default plugin;
```

### Step 5: Install Plugin Dependencies

```bash
cd ~/.vibescout/plugins/providers/my-provider
npm install
```

### Step 6: Verify Plugin

```bash
vibescout provider-plugin validate ~/.vibescout/plugins/providers/my-provider
```

You should see:
```
✓ package.json is valid
  Plugin Name: my-provider
  Version: 1.0.0
  Type: provider
  Provider Type: llm
  API Version: 1.0.0

✓ Main file found: index.ts
✓ Plugin name: my-provider
✓ Plugin type: llm
✓ Config schema found with 3 fields
✓ createProvider method found
✓ validateCredentials method found
✓ testConnection method found

✓ Provider plugin validation passed!
```

## Configuration Schema Reference

The `configSchema` defines how the configuration UI is generated. Each field can have these properties:

### Field Types

```typescript
interface ConfigField {
  name: string;           // Field identifier (used in config object)
  type: FieldType;        // Input type
  label: string;          // Display label
  placeholder?: string;   // Placeholder text
  required: boolean;      // Whether field is required
  helperText?: string;    // Help text shown below field
  options?: Array<{       // Options for 'select' type
    label: string;
    value: string;
  }>;
}

type FieldType = 'text' | 'password' | 'select' | 'arn' | 'region';
```

### Type Descriptions

- **`text`**: Standard text input
- **`password`**: Password input (hidden text)
- **`select`**: Dropdown selection (requires `options`)
- **`arn`**: AWS ARN input (validates format)
- **`region`**: AWS region dropdown (auto-populated)

### Example Schemas

#### Simple API Key Plugin

```typescript
configSchema: {
  fields: [
    {
      name: 'apiKey',
      type: 'password',
      label: 'API Key',
      required: true,
      helperText: 'Enter your API key'
    }
  ]
}
```

#### AWS Bedrock with AssumeRole

```typescript
configSchema: {
  fields: [
    {
      name: 'inferenceArn',
      type: 'arn',
      label: 'Inference Model ARN',
      placeholder: 'arn:aws:bedrock:us-east-1:123456789012:endpoint/custom-llm',
      required: false,
      helperText: 'Custom Bedrock endpoint ARN'
    },
    {
      name: 'region',
      type: 'region',
      label: 'AWS Region',
      required: true
    },
    {
      name: 'sourceProfile',
      type: 'text',
      label: 'Source Profile',
      placeholder: 'my-sso-profile',
      required: true,
      helperText: 'AWS profile from ~/.aws/config'
    },
    {
      name: 'roleArn',
      type: 'arn',
      label: 'Role ARN to Assume',
      placeholder: 'arn:aws:iam::123456789012:role/MyRole',
      required: true,
      helperText: 'IAM role to assume'
    }
  ]
}
```

#### Custom Model Selection

```typescript
configSchema: {
  fields: [
    {
      name: 'provider',
      type: 'select',
      label: 'Provider',
      required: true,
      options: [
        { label: 'OpenAI', value: 'openai' },
        { label: 'Anthropic', value: 'anthropic' },
        { label: 'Google', value: 'google' }
      ]
    },
    {
      name: 'model',
      type: 'select',
      label: 'Model',
      required: true,
      options: [
        { label: 'GPT-4', value: 'gpt-4' },
        { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
        { label: 'Claude 3', value: 'claude-3-opus' }
      ]
    }
  ]
}
```

## Provider Interface

### Embedding Provider Interface

```typescript
interface EmbeddingProvider {
  name: string;

  // Generate a single embedding
  generateEmbedding(text: string): Promise<number[]>;

  // Generate multiple embeddings (batch)
  generateEmbeddingsBatch(texts: string[]): Promise<number[][]>;
}
```

### LLM Provider Interface

```typescript
interface LLMProvider {
  name: string;

  // Summarize text
  summarize(text: string, maxLength?: number): Promise<string>;

  // Generate best question for code
  generateBestQuestion(code: string, summary: string): Promise<string>;

  // Generate response with optional context
  generateResponse(prompt: string, context?: string): Promise<string>;

  // Test connection/credentials
  testConnection(): Promise<boolean>;
}
```

## Plugin Interface

```typescript
interface ProviderPlugin {
  name: string;              // Plugin identifier
  version: string;           // Plugin version
  apiVersion: string;        // Plugin API version (must be "1.0.0")
  type: 'embedding' | 'llm'; // Provider type

  // Configuration schema for UI generation
  configSchema?: ConfigSchema;

  // Initialize plugin (optional)
  initialize?(context: PluginContext): void | Promise<void>;

  // Create provider instance
  createProvider?(config: any): any;

  // Validate credentials (optional)
  validateCredentials?(config: any): Promise<boolean>;

  // Test connection (optional)
  testConnection?(config: any): Promise<void>;
}
```

## Testing Your Plugin

### Manual Testing

1. **Validate plugin structure:**
   ```bash
   vibescout provider-plugin validate ~/.vibescout/plugins/providers/my-provider
   ```

2. **List available plugins:**
   ```bash
   vibescout provider-plugin list
   ```

3. **View plugin details:**
   ```bash
   vibescout provider-plugin info my-provider
   ```

### Testing in the UI

1. Restart VibeScout:
   ```bash
   vibescout ui
   ```

2. Open Config view in browser

3. Select LLM Provider → Your Plugin Type → Plugin (Custom Auth)

4. Select your plugin from dropdown

5. Fill in configuration fields

6. Click "Test Plugin Connection"

### Unit Testing

Create a test file `test.ts`:

```typescript
import { MyProvider } from './provider.js';

async function testProvider() {
  const provider = new MyProvider({
    apiKey: 'test-key',
    model: 'test-model',
    region: 'us-east-1'
  });

  // Test connection
  const connected = await provider.testConnection();
  console.log('Connection test:', connected);

  // Test summarization
  const summary = await provider.summarize('Long text to summarize...');
  console.log('Summary:', summary);

  // Test question generation
  const question = await provider.generateBestQuestion(
    'function hello() { return "world"; }',
    'A simple hello function'
  );
  console.log('Question:', question);
}

testProvider().catch(console.error);
```

## Publishing Plugins

### As npm Package

1. Add `publishConfig` to `package.json`:
   ```json
   {
     "name": "vibescout-provider-myprovider",
     "publishConfig": {
       "access": "public"
     }
   }
   ```

2. Publish to npm:
   ```bash
   npm publish
   ```

3. Users can install:
   ```bash
   vibescout provider-plugin install myprovider
   ```

### As Local Plugin

Users can install from local directory:
```bash
cp -r my-provider ~/.vibescout/plugins/providers/
```

Or install from git:
```bash
cd ~/.vibescout/plugins/providers
git clone https://github.com/user/vibescout-provider-myprovider.git
```

## CLI Commands

### List Provider Plugins

```bash
vibescout provider-plugin list
vibescout provider-plugin list -t llm        # Filter by type
vibescout pp list -t embedding               # Short form
```

### Get Plugin Info

```bash
vibescout provider-plugin info my-provider
vibescout pp info my-provider                # Short form
```

### Install Plugin

```bash
vibescout provider-plugin install my-provider
vibescout pp install my-provider             # Short form
```

### Uninstall Plugin

```bash
vibescout provider-plugin uninstall my-provider
vibescout pp uninstall my-provider           # Short form
```

### Validate Plugin

```bash
vibescout provider-plugin validate ~/.vibescout/plugins/providers/my-provider
vibescout pp validate ./my-plugin            # Short form
```

## Example Plugins

VibeScout includes several built-in provider plugins as examples:

### 1. bedrock-inference
Uses AWS access keys with inference ARN support
- Location: `src/plugins/providers/bedrock-inference/`
- Features: Access key authentication, custom inference ARNs

### 2. bedrock-llm-assume-role
Uses AWS SSO with AssumeRole for cross-account access
- Location: `src/plugins/providers/bedrock-llm-assume-role/`
- Features: SSO authentication, cross-account role assumption

### 3. bedrock-sso-inference
Uses AWS SSO profiles with inference ARN support
- Location: `src/plugins/providers/bedrock-sso-inference/`
- Features: SSO profile authentication, custom inference ARNs

## Troubleshooting

### Plugin Not Loading

**Problem:** Plugin doesn't appear in list

**Solutions:**
1. Check plugin structure matches requirements
2. Verify `package.json` has correct `vibescout` manifest
3. Ensure `main` file exists and is valid TypeScript
4. Check for TypeScript errors: `npx tsc --noEmit index.ts`
5. Review logs: `~/.vibescout/logs/plugin.log`

### Connection Test Failing

**Problem:** "Test Plugin Connection" button fails

**Solutions:**
1. Verify credentials are correct
2. Check network connectivity
3. Ensure required dependencies are installed
4. Test with CLI: `vibescout provider-plugin info my-provider`
5. Add debug logging in `provider.ts`

### Config Schema Not Showing

**Problem:** Configuration form doesn't render

**Solutions:**
1. Ensure `configSchema` is defined in plugin
2. Check field names are unique
3. Verify field types are valid
4. Test schema: `vibescout provider-plugin validate my-provider`

## Best Practices

1. **Credential Security**: Use `type: 'password'` for sensitive fields like API keys
2. **Validation**: Implement `validateCredentials()` to verify configuration
3. **Error Handling**: Catch and log errors properly for debugging
4. **Testing**: Always test connection before using provider
5. **Documentation**: Include helpful text for all config fields
6. **Versioning**: Use semantic versioning for your plugins
7. **Dependencies**: Pin dependency versions to avoid breaking changes

## Advanced Features

### Dynamic Configuration

You can make configuration fields conditional based on other fields:

```typescript
// In UI, you can show/hide fields based on selections
configSchema: {
  fields: [
    {
      name: 'authType',
      type: 'select',
      label: 'Authentication Type',
      options: [
        { label: 'API Key', value: 'apiKey' },
        { label: 'OAuth', value: 'oauth' }
      ]
    },
    // Show different fields based on authType
    // (This requires custom UI logic)
  ]
}
```

### Credential Caching

Implement credential caching to avoid repeated authentication:

```typescript
export class MyProvider {
  private cachedCredentials?: any;

  async getCredentials() {
    if (this.cachedCredentials) {
      return this.cachedCredentials;
    }

    const credentials = await this.authenticate();
    this.cachedCredentials = credentials;
    return credentials;
  }
}
```

### Multi-Model Support

Support multiple models in one provider:

```typescript
configSchema: {
  fields: [
    {
      name: 'model',
      type: 'select',
      label: 'Model',
      options: [
        { label: 'GPT-4 (Best)', value: 'gpt-4' },
        { label: 'GPT-3.5 (Fast)', value: 'gpt-3.5-turbo' },
        { label: 'GPT-3.5 (Cheap)', value: 'gpt-3.5-turbo-16k' }
      ]
    }
  ]
}
```

## API Reference

### Plugin Management API

#### List Provider Plugins
```http
GET /api/plugins/providers
```

Response:
```json
{
  "plugins": [
    {
      "name": "my-provider",
      "version": "1.0.0",
      "type": "llm",
      "configSchema": {
        "fields": [...]
      }
    }
  ]
}
```

#### Get Plugin Schema
```http
GET /api/plugins/providers/:name/schema
```

#### Test Plugin Connection
```http
POST /api/plugins/providers/:name/test
Content-Type: application/json

{
  "apiKey": "sk-...",
  "model": "gpt-4",
  "region": "us-east-1"
}
```

## Support

For more help:
- Check example plugins in `src/plugins/providers/`
- Review plugin type definitions in `src/plugins/types.ts`
- Open an issue on GitHub
- Check existing provider implementations in `src/providers/`
