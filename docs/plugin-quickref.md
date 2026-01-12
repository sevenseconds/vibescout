# VibeScout Plugin Quick Reference

Quick reference for developing VibeScout plugins.

## Quick Start Commands

```bash
# Create plugin directory
mkdir vibescout-plugin-myframework
cd vibescout-plugin-myframework
npm init -y

# Create basic structure
mkdir -p src test
touch index.js src/MyFrameworkExtractor.js

# For local testing
mkdir -p ~/.vibescout/plugins
ln -s $(pwd) ~/.vibescout/plugins/myframework

# Test your plugin
vibescout plugin list
vibescout index ./test-project

# When ready to publish
npm publish
```

## Minimal Plugin Structure

### package.json
```json
{
  "name": "vibescout-plugin-myframework",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "vibescout": {
    "apiVersion": "1.0.0",
    "capabilities": ["extractors"]
  }
}
```

### index.js
```javascript
const plugin = {
  name: "myframework",
  version: "1.0.0",
  apiVersion: "1.0.0",
  extractors: [MyFrameworkExtractor]
};
export default plugin;
```

### Extractor Template
```javascript
export const MyFrameworkExtractor = {
  name: "MyFrameworkExtractor",
  extensions: [".ext"],
  priority: 10,

  async extract(code, filePath) {
    return {
      blocks: [/* code blocks */],
      metadata: {
        imports: [/* imports */],
        exports: [/* exports */],
        framework: "myframework",
        myframework: { /* custom metadata */ }
      }
    };
  }
};
```

## Extraction Result Schema

```typescript
{
  blocks: [
    {
      name: string,              // Symbol/block name
      type: string,              // function, class, method, chunk
      category: "code" | "documentation",
      startLine: number,         // 1-indexed
      endLine: number,
      comments: string,
      content: string,
      filePath: string,
      parentName?: string        // For chunks
    }
  ],
  metadata: {
    imports?: [
      {
        source: string,
        symbols: string[],
        runtime?: boolean
      }
    ],
    exports?: string[],
    framework?: string,
    [key: string]: any          // Custom framework metadata
  }
}
```

## Common Extraction Patterns

### Extract by Regex
```javascript
const pattern = /myPattern/g;
const matches = code.matchAll(pattern);
for (const match of matches) {
  // Process match
}
```

### Extract Blocks Between Tags
```javascript
const tagMatch = code.match(/<tag[^>]*>([\s\S]*?)<\/tag>/);
if (tagMatch) {
  const content = tagMatch[1];
  const startLine = code.substring(0, tagMatch.index).split("\n").length + 1;
  // Use content and startLine
}
```

### Extract Object Properties
```javascript
const objMatch = code.match(/myObject\s*=\s*{([\s\S]*?)}/);
if (objMatch) {
  const propsText = objMatch[1];
  const propMatches = propsText.matchAll(/(\w+)\s*:/g);
  for (const match of propMatches) {
    console.log(match[1]); // Property name
  }
}
```

### Extract Imports
```javascript
const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
for (const match of code.matchAll(importRegex)) {
  const namedImports = match[1];
  const defaultImport = match[2];
  const source = match[3];
}
```

## Framework Detection Patterns

### TypeScript/JavaScript Frameworks
```javascript
// Check for framework-specific imports
if (code.includes('from "react"')) framework = "react";
if (code.includes('from "vue"')) framework = "vue";
if (code.includes('from "@angular/core"')) framework = "angular";
if (code.includes('from "svelte"')) framework = "svelte";
```

### File Path Patterns
```javascript
import path from "path";

const segments = filePath.split(path.sep);

if (segments.includes("app")) return "nextjs-app";
if (segments.includes("pages")) return "nextjs-pages";
if (segments.includes("routes")) return "react-router";
```

### Special Files
```javascript
const filename = path.basename(filePath);

if (filename === "layout.tsx") return "layout";
if (filename.startsWith("[") && filename.includes("]")) return "dynamic";
if (filename.endsWith(".blade.php")) return "laravel-blade";
```

## Testing Template

```javascript
import { describe, it, expect } from "vitest";
import { MyExtractor } from "../src/MyExtractor.js";

describe("MyExtractor", () => {
  it("should extract metadata", async () => {
    const code = "sample code here";
    const result = await MyExtractor.extract(code, "/path/to/file.ext");

    expect(result.blocks).toBeDefined();
    expect(result.metadata.framework).toBe("myframework");
  });

  it("should handle edge case", async () => {
    const code = "edge case code";
    const result = await MyExtractor.extract(code, "/path/to/file.ext");

    expect(result.metadata).toMatchObject({ /* expected */ });
  });
});
```

## Debugging Tips

### Enable Debug Logging
```javascript
async initialize(context) {
  context.logger.setLevel("debug");
  context.logger.debug("Plugin initializing...");
}
```

### Log Extraction Results
```javascript
async extract(code, filePath) {
  const result = { /* ... */ };

  // Log for debugging
  console.log(`[MyExtractor] Extracted from ${filePath}:`, result);

  return result;
}
```

### Test with Real Files
```bash
# Create test fixtures directory
mkdir -p test/fixtures

# Copy real framework files there
cp ~/my-project/components/*.vue test/fixtures/

# Run tests
npm test

# Or test with VibeScout directly
vibescout index test/fixtures
vibescout search "test query"
```

## Common Pitfalls

### ❌ Wrong: Using single quotes in JS files
```javascript
import { Extractor } from './Extractor.js'  // Linter error
```

### ✅ Correct: Using double quotes
```javascript
import { Extractor } from "./Extractor.js"
```

### ❌ Wrong: Not handling errors
```javascript
async extract(code, filePath) {
  const result = parse(code); // May throw
  return result;
}
```

### ✅ Correct: Handling errors gracefully
```javascript
async extract(code, filePath) {
  try {
    const result = parse(code);
    return result;
  } catch (error) {
    return {
      blocks: [{ name: path.basename(filePath), type: "file", /* ... */ }],
      metadata: { error: error.message }
    };
  }
}
```

### ❌ Wrong: Using wrong file path separator
```javascript
const segments = filePath.split("/"); // Won't work on Windows
```

### ✅ Correct: Using path module
```javascript
import path from "path";
const segments = filePath.split(path.sep);
```

## Configuration Options

### In ~/.vibescout/config.json
```json
{
  "pluginSystem": {
    "enabled": true,
    "sandboxed": true,
    "timeout": 30000,
    "maxMemory": "512MB",
    "disabled": [],
    "allowedModules": ["fs", "path", "crypto"]
  }
}
```

### Access Plugin Config
```javascript
async initialize(context) {
  const myConfig = context.config.myPlugin;
  const timeout = context.config.pluginSystem?.timeout || 30000;
}
```

## CLI Commands Reference

```bash
# List plugins
vibescout plugin list

# Show plugin info
vibescout plugin info vibescout-plugin-myframework

# Index with plugins
vibescout index ./my-project

# Disable plugins
vibescout --no-plugins index ./my-project

# Search with plugin metadata
vibescout search "framework:react components"
```

## Publishing Checklist

- [ ] Update version in package.json
- [ ] Test locally with `~/.vibescout/plugins/`
- [ ] Run tests: `npm test`
- [ ] Update README.md with examples
- [ ] Add keywords to package.json
- [ ] Ensure "vibescout-plugin" prefix in name
- [ ] Verify apiVersion matches current (1.0.0)
- [ ] Test install: `npm install -g .`
- [ ] Publish: `npm publish`

## Resources

- [Full Plugin Guide](plugin-guide.md)
- [API Reference](plugin-api.md)
- [Architecture](plugin-architecture.md)
- [Complete Example](plugin-example.md)
- [Prompt Template](plugin-prompt-template.md)

## Support

- GitHub Issues: https://github.com/sevenseconds/vibescout/issues
- Plugin Help: Use the prompt template with Claude Code
