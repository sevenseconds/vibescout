# VibeScout Plugin Development Guide

This guide will help you create plugins for VibeScout. Plugins extend VibeScout with custom extractors, AI providers, and CLI commands.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Plugin Structure](#plugin-structure)
3. [Creating an Extractor Plugin](#creating-an-extractor-plugin)
4. [Creating a Provider Plugin](#creating-a-provider-plugin)
5. [Creating a Command Plugin](#creating-a-command-plugin)
6. [Testing Your Plugin](#testing-your-plugin)
7. [Publishing Your Plugin](#publishing-your-plugin)
8. [Example Plugins](#example-plugins)

## Quick Start

### Prerequisites

- Node.js 18+
- Basic knowledge of JavaScript/TypeScript
- Understanding of AST parsing (for extractor plugins)

### Create a Plugin

1. **Create a new project:**

```bash
mkdir vibescout-plugin-myplugin
cd vibescout-plugin-myplugin
npm init -y
```

2. **Create the plugin entry point:**

```javascript
// index.js
const plugin = {
  name: 'myplugin',
  version: '1.0.0',
  apiVersion: '1.0.0',

  extractors: [
    // Your extractors here
  ]
};

export default plugin;
```

3. **Update package.json:**

```json
{
  "name": "vibescout-plugin-myplugin",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "vibescout": {
    "apiVersion": "1.0.0",
    "capabilities": ["extractors"]
  }
}
```

## Plugin Structure

A VibeScout plugin has the following structure:

```
vibescout-plugin-myplugin/
├── package.json          # Plugin manifest
├── index.js             # Plugin entry point
├── src/
│   ├── extractors/      # Extractor implementations
│   ├── providers/       # Provider implementations
│   └── commands/        # Command implementations
└── README.md
```

### package.json

```json
{
  "name": "vibescout-plugin-myplugin",
  "version": "1.0.0",
  "description": "My VibeScout plugin",
  "main": "index.js",
  "type": "module",
  "vibescout": {
    "apiVersion": "1.0.0",
    "capabilities": ["extractors", "providers", "commands"],
    "sandbox": {
      "requires": ["fs", "path"],
      "timeout": 30000
    }
  }
}
```

### Plugin Entry Point

```javascript
// index.js
const plugin = {
  // Required fields
  name: 'myplugin',
  version: '1.0.0',
  apiVersion: '1.0.0',

  // Optional fields
  description: 'My plugin description',
  author: 'Your Name',
  homepage: 'https://github.com/user/vibescout-plugin-myplugin',

  // Lifecycle hooks
  async initialize(context) {
    // Called when plugin is loaded
    context.logger.info('Plugin initialized');
  },

  async activate(context) {
    // Called after all plugins are loaded
  },

  async deactivate() {
    // Called when plugin is unloaded
  },

  // Capabilities
  extractors: [],
  providers: [],
  commands: []
};

export default plugin;
```

## Creating an Extractor Plugin

Extractors parse code files and extract code blocks with metadata.

### Basic Extractor

```javascript
export const MyExtractor = {
  name: 'MyExtractor',
  extensions: ['.mylang'],  // File extensions to handle
  priority: 10,             // Higher priority overrides built-in extractors

  async extract(code, filePath) {
    return {
      blocks: [
        {
          name: 'MyFunction',
          type: 'function',
          category: 'code',
          startLine: 1,
          endLine: 10,
          comments: '// My function',
          content: code,
          filePath
        }
      ],
      metadata: {
        imports: [],
        exports: ['MyFunction']
      }
    };
  }
};
```

### Extending TypeScript Extractor

For TypeScript-based frameworks (Next.js, React Router, etc.), you can extend the built-in TypeScript extractor:

```javascript
import { TypeScriptStrategy } from '@sevenseconds/vibescout';

export const NextJSExtractor = {
  name: 'NextJSExtractor',
  extensions: ['.tsx', '.jsx'],
  priority: 10,  // Higher than TypeScriptStrategy

  async extract(code, filePath) {
    // Get base extraction
    const { blocks, metadata } = await TypeScriptStrategy.extract(code, filePath);

    // Add framework-specific metadata
    return {
      blocks,
      metadata: {
        ...metadata,
        framework: 'nextjs',
        routeType: detectRouteType(filePath),
        navigation: extractNavigation(code)
      }
    };
  }
};
```

### Complete Example: Framework Extractor

```javascript
import path from 'path';

function detectRouteType(filePath) {
  const segments = filePath.split(path.sep);
  const filename = segments[segments.length - 1];

  if (filename === 'page.tsx') return 'page';
  if (filename === 'layout.tsx') return 'layout';
  return 'component';
}

export const FrameworkExtractor = {
  name: 'FrameworkExtractor',
  extensions: ['.tsx', '.jsx'],
  priority: 10,

  async extract(code, filePath) {
    const routeType = detectRouteType(filePath);

    return {
      blocks: [],
      metadata: {
        framework: 'myframework',
        routeType
      }
    };
  }
};
```

## Creating a Provider Plugin

Providers implement AI capabilities (embedding generation or text summarization).

### Embedding Provider

```javascript
export const MyEmbeddingProvider = {
  name: 'my-embedding',
  type: 'embedding',

  async initialize(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'my-model';
  },

  async generateEmbedding(text) {
    // Call your embedding API
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
    // Process multiple texts efficiently
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

```javascript
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

## Creating a Command Plugin

Commands add new CLI functionality to VibeScout.

### Basic Command

```javascript
export const MyCommand = {
  name: 'my-command',
  description: 'My custom command',
  arguments: '<required> [optional]',

  async execute(args, options) {
    const [required, optional] = args;

    console.log(`Required: ${required}`);
    console.log(`Optional: ${optional}`);
    console.log(`Options:`, options);
  }
};
```

### Accessing VibeScout Services

```javascript
export const AnalyzeCommand = {
  name: 'analyze',
  description: 'Analyze project dependencies',

  async execute(args, options) {
    // Import VibeScout services
    const { search } = await import('@sevenseconds/vibescout/db');

    const results = await search('import');

    console.log(`Found ${results.length} imports`);
    results.forEach(result => {
      console.log(`- ${result.filepath}`);
    });
  }
};
```

## Testing Your Plugin

### Local Testing

1. **Create plugins directory:**

```bash
mkdir -p ~/.vibescout/plugins
```

2. **Link your plugin:**

```bash
cd ~/.vibescout/plugins
ln -s /path/to/vibescout-plugin-myplugin myplugin
```

3. **Test with VibeScout:**

```bash
# List plugins
vibescout plugin list

# Index with plugins
vibescout index ./my-project

# Disable plugins if needed
vibescout --no-plugins index ./my-project
```

### Unit Testing

```javascript
// test/extractor.test.js
import { describe, it, expect } from 'vitest';
import { MyExtractor } from '../src/extractors/MyExtractor.js';

describe('MyExtractor', () => {
  it('should extract functions', async () => {
    const code = 'function foo() { return 42; }';
    const result = await MyExtractor.extract(code, '/path/to/file.js');

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].name).toBe('foo');
  });
});
```

## Publishing Your Plugin

### Publishing to npm

1. **Update package.json:**

```json
{
  "name": "vibescout-plugin-myplugin",
  "version": "1.0.0",
  "description": "My VibeScout plugin",
  "main": "index.js",
  "type": "module",
  "vibescout": {
    "apiVersion": "1.0.0",
    "capabilities": ["extractors"]
  },
  "keywords": ["vibescout", "vibescout-plugin", "code-search"],
  "repository": {
    "type": "git",
    "url": "https://github.com/user/vibescout-plugin-myplugin.git"
  }
}
```

2. **Publish:**

```bash
npm publish
```

3. **Users install with:**

```bash
npm install -g vibescout-plugin-myplugin
```

## Example Plugins

### Built-in Examples

- [NextJS Plugin](../src/plugin-system/builtin-extractors/NextJSPlugin.js) - Next.js framework support
- [ReactRouter Plugin](../src/plugin-system/builtin-extractors/ReactRouterPlugin.js) - React Router v7/Remix support

### Complete Tutorial Example

See [plugin-example.md](plugin-example.md) for a complete, production-ready Vue.js plugin with:
- Full implementation
- Test suite
- Documentation
- Package configuration
- Publishing instructions

### Generating New Plugins

Use the [plugin-prompt-template.md](plugin-prompt-template.md) to generate plugins for any framework:
- Fill in the template with your framework details
- Paste into Claude Code
- Get a complete plugin implementation

### Common Framework Templates

The prompt template includes ready-to-use prompts for:
- Frontend frameworks (React, Vue, Angular, Svelte)
- Backend frameworks (Laravel, Rails, Django, Express)
- Template engines (Blade, Twig, ERB, JSX)

See the [Plugin API Reference](plugin-api.md) for complete API documentation.
