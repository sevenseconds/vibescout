# VibeScout Plugin API Reference

Complete API reference for VibeScout plugins.

## Contents

- [Plugin Interface](#plugin-interface)
- [Extractor Plugin API](#extractor-plugin-api)
- [Provider Plugin API](#provider-plugin-api)
- [Command Plugin API](#command-plugin-api)
- [Plugin Context API](#plugin-context-api)
- [Type Definitions](#type-definitions)

## Plugin Interface

### `VibeScoutPlugin`

The main plugin interface that all plugins must implement.

```typescript
interface VibeScoutPlugin {
  // Required fields
  name: string;           // Unique plugin name (kebab-case)
  version: string;        // Plugin version (semver)
  apiVersion: string;     // Plugin API version compatible with

  // Optional metadata
  description?: string;   // Plugin description
  author?: string;        // Plugin author/maintainer
  homepage?: string;      // Homepage URL

  // Lifecycle hooks
  initialize?(context: PluginContext): Promise<void> | void;
  activate?(context: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;

  // Capabilities
  extractors?: ExtractorPlugin[];
  providers?: ProviderPlugin[];
  commands?: CommandPlugin[];
}
```

### Lifecycle Hooks

#### `initialize(context)`

Called when the plugin is first loaded. Use this to:
- Validate configuration
- Set up resources
- Validate API keys

```typescript
async initialize(context: PluginContext): Promise<void> {
  const apiKey = context.config.myPluginApiKey;
  if (!apiKey) {
    throw new Error('API key required');
  }
  context.logger.info('Plugin initialized');
}
```

#### `activate(context)`

Called after all plugins are loaded. Use this to:
- Register capabilities that depend on other plugins
- Perform late initialization

```typescript
async activate(context: PluginContext): Promise<void> {
  context.registerExtractor(myExtractor);
}
```

#### `deactivate()`

Called when the plugin is unloaded. Use this to:
- Clean up resources
- Close connections
- Save state

```typescript
async deactivate(): Promise<void> {
  await this.closeConnection();
}
```

## Extractor Plugin API

### `ExtractorPlugin`

Code extractors parse files and extract code blocks with metadata.

```typescript
interface ExtractorPlugin {
  name: string;                    // Unique extractor name
  extensions: string[];             // File extensions to handle
  priority?: number;                // Priority (higher wins, default: 0)

  extract(
    code: string,
    filePath: string
  ): Promise<ExtractionResult> | ExtractionResult;
}
```

### `ExtractionResult`

Result of code extraction.

```typescript
interface ExtractionResult {
  blocks: CodeBlock[];
  metadata: {
    imports?: ImportInfo[];
    exports?: string[];
    framework?: string;
    [key: string]: any;
  };
}
```

### `CodeBlock`

A code block (function, class, method, etc.).

```typescript
interface CodeBlock {
  name: string;                    // Symbol/block name
  type: string;                    // Block type (function, class, method, chunk)
  category: 'code' | 'documentation';
  startLine: number;               // Start line number (1-indexed)
  endLine: number;                 // End line number (1-indexed)
  comments: string;                // Extracted comments
  content: string;                 // Code content
  filePath: string;                // File path
  parentName?: string;             // Parent symbol name (for chunks)
}
```

### `ImportInfo`

Import dependency information.

```typescript
interface ImportInfo {
  source: string;                  // Module source (e.g., 'next/link')
  symbols: string[];               // Imported symbols
  runtime?: boolean;               // Whether this is a runtime dependency
}
```

## Provider Plugin API

### `ProviderPlugin`

AI providers implement embedding generation or text summarization.

```typescript
interface ProviderPlugin {
  name: string;                    // Unique provider name
  type: 'embedding' | 'summarizer';

  initialize?(config: any): Promise<void> | void;
  generateEmbedding?(text: string): Promise<number[]>;
  generateEmbeddingsBatch?(texts: string[]): Promise<number[][]>;
  summarize?(text: string, maxLength?: number): Promise<string>;
  generateResponse?(prompt: string, context?: string): Promise<string>;
  generateBestQuestion?(code: string, summary: string): Promise<string>;
  isAvailable?(): Promise<boolean> | boolean;
}
```

### Embedding Provider

```typescript
interface EmbeddingProvider extends ProviderPlugin {
  type: 'embedding';

  // Generate embedding for a single text
  generateEmbedding(text: string): Promise<number[]>;

  // Generate embeddings for multiple texts (optional, for batch efficiency)
  generateEmbeddingsBatch?(texts: string[]): Promise<number[][]>;

  // Check if provider is configured and available
  isAvailable?(): Promise<boolean> | boolean;
}
```

Example:

```typescript
export const MyEmbeddingProvider = {
  name: 'my-embedding',
  type: 'embedding',

  async initialize(config) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  },

  async generateEmbedding(text) {
    const response = await fetch('https://api.example.com/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, model: this.model })
    });
    const data = await response.json();
    return data.embedding;
  },

  async generateEmbeddingsBatch(texts) {
    return Promise.all(
      texts.map(text => this.generateEmbedding(text))
    );
  },

  async isAvailable() {
    return !!this.apiKey;
  }
};
```

### Summarizer Provider

```typescript
interface SummarizerProvider extends ProviderPlugin {
  type: 'summarizer';

  // Summarize text to a concise description
  summarize?(text: string, maxLength?: number): Promise<string>;

  // Generate a response from a prompt
  generateResponse?(prompt: string, context?: string): Promise<string>;

  // Generate the best question for a code block
  generateBestQuestion?(code: string, summary: string): Promise<string>;
}
```

Example:

```typescript
export const MySummarizerProvider = {
  name: 'my-summarizer',
  type: 'summarizer',

  async initialize(config) {
    this.apiKey = config.apiKey;
  },

  async summarize(text, maxLength = 200) {
    const response = await fetch('https://api.example.com/summarize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, maxLength })
    });
    const data = await response.json();
    return data.summary;
  },

  async generateResponse(prompt, context) {
    const response = await fetch('https://api.example.com/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, context })
    });
    const data = await response.json();
    return data.response;
  }
};
```

## Command Plugin API

### `CommandPlugin`

CLI commands add new functionality to the VibeScout CLI.

```typescript
interface CommandPlugin {
  name: string;                    // Unique command name
  description: string;             // Command description (for help)
  arguments?: string;              // Arguments string (for help text)

  execute(args: string[], options: Record<string, any>): Promise<void> | void;
}
```

Example:

```typescript
export const MyCommand = {
  name: 'my-command',
  description: 'My custom command',
  arguments: '<required> [optional]',

  async execute(args, options) {
    const [required, optional] = args;
    console.log(`Required: ${required}`);
    console.log(`Options:`, options);
  }
};
```

## Plugin Context API

### `PluginContext`

Context provided to plugins during initialization and activation.

```typescript
interface PluginContext {
  config: any;                     // Current VibeScout configuration
  logger: Logger;                  // Namespaced logger instance
  registerExtractor(extractor: ExtractorPlugin): void;
  registerProvider(provider: ProviderPlugin): void;
  registerCommand(command: CommandPlugin): void;
}
```

### Logger

```typescript
interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}
```

Example:

```typescript
async initialize(context: PluginContext) {
  context.logger.info('Plugin initializing...');
  context.logger.debug('Debug info');
  context.logger.warn('Warning message');
  context.logger.error('Error message');
}
```

### Registration Methods

#### `registerExtractor(extractor)`

Register a code extractor.

```typescript
context.registerExtractor({
  name: 'my-extractor',
  extensions: ['.mylang'],
  extract: async (code, filePath) => { /* ... */ }
});
```

#### `registerProvider(provider)`

Register an AI provider.

```typescript
context.registerProvider({
  name: 'my-provider',
  type: 'embedding',
  generateEmbedding: async (text) => { /* ... */ }
});
```

#### `registerCommand(command)`

Register a CLI command.

```typescript
context.registerCommand({
  name: 'my-command',
  description: 'My command',
  execute: async (args, options) => { /* ... */ }
});
```

## Type Definitions

### `PluginManifest`

Plugin manifest from package.json.

```typescript
interface PluginManifest {
  name: string;
  version: string;
  main?: string;
  vibescout?: {
    apiVersion: string;
    capabilities?: ('extractors' | 'providers' | 'commands')[];
    sandbox?: {
      requires?: string[];
      timeout?: number;
      maxMemory?: string;
    };
  };
}
```

### `PluginInfo`

Plugin information returned by the loader.

```typescript
interface PluginInfo {
  name: string;
  version: string;
  source: 'npm' | 'local';
  path: string;
  manifest: PluginManifest;
  enabled: boolean;
  loaded: boolean;
  error?: string;
}
```

## Configuration

### Plugin Configuration

Plugins are configured in `~/.vibescout/config.json`:

```json
{
  "pluginSystem": {
    "enabled": true,
    "sandboxed": true,
    "pluginPaths": [],
    "disabled": [],
    "timeout": 30000,
    "maxMemory": "512MB",
    "allowedModules": ["fs", "path", "crypto", "os", "util"]
  }
}
```

### Accessing Plugin Configuration

```typescript
async initialize(context: PluginContext) {
  const pluginConfig = context.config.myPlugin;
  // Use pluginConfig...
}
```

## Sandbox API

Plugins run in a sandboxed environment with the following restrictions:

- **Timeout**: Default 30 seconds (configurable)
- **Memory**: Default 512MB limit (configurable)
- **Module Access**: Only whitelisted modules allowed

### Allowed Modules

Default whitelist: `['fs', 'path', 'crypto', 'os', 'util']`

Customize in config:

```json
{
  "pluginSystem": {
    "allowedModules": ["fs", "path", "crypto", "os", "util", "child_process"]
  }
}
```

## Error Handling

### Plugin Errors

Plugins should handle errors gracefully:

```typescript
async initialize(context: PluginContext) {
  try {
    await this.connect();
  } catch (error) {
    context.logger.error('Failed to connect:', error.message);
    throw error; // Plugin will be marked as failed
  }
}
```

### Extraction Errors

Extractors should return partial results on error:

```typescript
async extract(code, filePath) {
  try {
    const blocks = await this.parseCode(code);
    return { blocks, metadata: {} };
  } catch (error) {
    // Return empty result rather than throwing
    return {
      blocks: [{
        name: path.basename(filePath),
        type: 'file',
        content: code,
        filePath,
        // ... other required fields
      }],
      metadata: { error: error.message }
    };
  }
}
```

See the [Plugin Development Guide](plugin-guide.md) for implementation examples.
