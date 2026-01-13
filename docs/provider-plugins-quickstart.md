# Provider Plugin Quick Start

Create a custom LLM provider plugin for VibeScout in 10 minutes.

## What You'll Build

A simple LLM provider plugin that:
- Uses an API key for authentication
- Connects to any OpenAI-compatible API
- Generates summaries and responses

## Prerequisites

- Node.js installed
- Text editor (VS Code, etc.)
- API endpoint you want to use

## Step 1: Create Plugin Directory (1 min)

```bash
mkdir -p ~/.vibescout/plugins/providers/my-llm-provider
cd ~/.vibescout/plugins/providers/my-llm-provider
```

## Step 2: Create package.json (2 min)

```bash
cat > package.json << 'EOF'
{
  "name": "my-llm-provider",
  "version": "1.0.0",
  "description": "My custom LLM provider",
  "main": "index.ts",
  "type": "module",
  "vibescout": {
    "type": "provider",
    "providerType": "llm",
    "apiVersion": "1.0.0"
  },
  "dependencies": {
    "openai": "^4.0.0"
  }
}
EOF
```

## Step 3: Create Provider Implementation (4 min)

```bash
cat > provider.ts << 'EOF'
import OpenAI from 'openai';

export interface MyLLMOptions {
  apiKey: string;
  baseURL: string;
  model: string;
}

export class MyLLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(options: MyLLMOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL
    });
    this.model = options.model;
  }

  get name() {
    return 'my-llm-provider';
  }

  async summarize(text: string, maxLength?: number): Promise<string> {
    const maxLen = maxLength || 500;
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{
        role: 'user',
        content: `Summarize this in ${maxLen} characters or less:\n\n${text}`
      }]
    });
    return response.choices[0].message.content || '';
  }

  async generateBestQuestion(code: string, summary: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{
        role: 'user',
        content: `Summary: ${summary}\n\nCode:\n${code}\n\nGenerate one question that would help understand this code.`
      }]
    });
    return response.choices[0].message.content || '';
  }

  async generateResponse(prompt: string, context?: string): Promise<string> {
    const content = context ? `Context:\n${context}\n\nQuestion:\n${prompt}` : prompt;
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content }]
    });
    return response.choices[0].message.content || '';
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
      });
      return true;
    } catch {
      return false;
    }
  }
}
EOF
```

## Step 4: Create Plugin Definition (2 min)

```bash
cat > index.ts << 'EOF'
import { ProviderPlugin, PluginContext } from '../../../src/plugins/types.js';
import { MyLLMProvider } from './provider.js';

const plugin: ProviderPlugin = {
  name: 'my-llm-provider',
  version: '1.0.0',
  apiVersion: '1.0.0',
  type: 'llm',

  configSchema: {
    fields: [
      {
        name: 'apiKey',
        type: 'password',
        label: 'API Key',
        placeholder: 'sk-...',
        required: true,
        helperText: 'Your API key'
      },
      {
        name: 'baseURL',
        type: 'text',
        label: 'API Base URL',
        placeholder: 'https://api.openai.com/v1',
        required: true,
        helperText: 'Base URL for your API'
      },
      {
        name: 'model',
        type: 'text',
        label: 'Model Name',
        placeholder: 'gpt-3.5-turbo',
        required: true,
        helperText: 'Model to use'
      }
    ]
  },

  initialize(context: PluginContext) {
    context.registerProvider(this);
  },

  createProvider(config: any) {
    return new MyLLMProvider({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model
    });
  },

  async validateCredentials(config: any): Promise<boolean> {
    try {
      const provider = this.createProvider!(config);
      return await provider.testConnection();
    } catch {
      return false;
    }
  },

  async testConnection(config: any): Promise<void> {
    const provider = this.createProvider!(config);
    const success = await provider.testConnection();
    if (!success) {
      throw new Error('Connection failed');
    }
  }
};

export default plugin;
EOF
```

## Step 5: Install Dependencies (1 min)

```bash
npm install
```

## Step 6: Verify Plugin (30 seconds)

```bash
vibescout provider-plugin validate ~/.vibescout/plugins/providers/my-llm-provider
```

Expected output:
```
✓ package.json is valid
✓ Main file found: index.ts
✓ Plugin name: my-llm-provider
✓ Plugin type: llm
✓ Config schema found with 3 fields
✓ Provider plugin validation passed!
```

## Step 7: Use Your Plugin

1. **Restart VibeScout:**
   ```bash
   vibescout ui
   ```

2. **Open Config in browser** → http://localhost:3000/config

3. **Configure LLM Provider:**
   - LLM Provider → "OpenAI Compatible" or "Bedrock" → "Plugin (Custom Auth)"
   - Select "my-llm-provider" from dropdown
   - Fill in: API Key, Base URL, Model
   - Click "Test Plugin Connection"

4. **Start using it!**

## Common Customizations

### Use Environment Variables

Replace explicit API key fields with:

```typescript
configSchema: {
  fields: [
    {
      name: 'apiKey',
      type: 'password',
      label: 'API Key',
      required: false,  // Make optional
      helperText: 'Leave empty to use MY_API_KEY env var'
    }
  ]
}
```

In provider.ts:
```typescript
const apiKey = options.apiKey || process.env.MY_API_KEY;
```

### Add Model Selection

```typescript
configSchema: {
  fields: [
    {
      name: 'model',
      type: 'select',
      label: 'Model',
      required: true,
      options: [
        { label: 'GPT-4 (Best)', value: 'gpt-4' },
        { label: 'GPT-3.5 (Fast)', value: 'gpt-3.5-turbo' },
        { label: 'GPT-3.5 (16K)', value: 'gpt-3.5-turbo-16k' }
      ]
    }
  ]
}
```

### Support Multiple Providers

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
        { label: 'Local', value: 'local' }
      ]
    },
    {
      name: 'apiKey',
      type: 'password',
      label: 'API Key',
      required: true
    }
  ]
}
```

## Example Use Cases

### OpenAI-Compatible API

```typescript
// For services like TogetherAI, Anyscale, etc.
{
  name: 'baseURL',
  type: 'text',
  label: 'Base URL',
  placeholder: 'https://api.together.xyz/v1',
  required: true
}
```

### Azure OpenAI

```typescript
{
  name: 'endpoint',
  type: 'text',
  label: 'Azure Endpoint',
  placeholder: 'https://your-resource.openai.azure.com',
  required: true
},
{
  name: 'deployment',
  type: 'text',
  label: 'Deployment Name',
  placeholder: 'gpt-35-turbo',
  required: true
},
{
  name: 'apiKey',
  type: 'password',
  label: 'API Key',
  required: true
}
```

### Local LLM (Ollama)

```typescript
{
  name: 'baseUrl',
  type: 'text',
  label: 'Ollama URL',
  placeholder: 'http://localhost:11434',
  required: true
},
{
  name: 'model',
  type: 'text',
  label: 'Model',
  placeholder: 'llama2',
  required: true
}
```

## Troubleshooting

**Plugin not appearing?**
```bash
# Check plugin is valid
vibescout provider-plugin validate ~/.vibescout/plugins/providers/my-llm-provider

# List all plugins
vibescout provider-plugin list
```

**Connection test failing?**
- Check API key is correct
- Verify base URL is accessible
- Check console logs in browser DevTools
- Try testing with curl first:
  ```bash
  curl -X POST https://your-api.com/v1/chat/completions \
    -H "Authorization: Bearer YOUR_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"test"}]}'
  ```

**TypeScript errors?**
```bash
# Check TypeScript compilation
npx tsc --noEmit index.ts provider.ts
```

## Next Steps

- See full docs: `docs/provider-plugins.md`
- Check example plugins: `src/plugins/providers/`
- Learn about config schemas
- Add embedding support
- Publish your plugin to npm

## Need Help?

- Check example plugins in `src/plugins/providers/`
- Review type definitions in `src/plugins/types.ts`
- Open an issue on GitHub

Happy coding! 🚀
