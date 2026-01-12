# VibeScout Plugin Example: Vue.js SFC Support

This is a complete example plugin that adds support for Vue.js Single File Components (.vue files).

## Plugin Overview

This plugin extracts:
- Component name and metadata
- Script setup vs traditional script
- Template structure
- Style blocks
- Composables and hooks usage
- Props and emits definitions

## File Structure

```
vibescout-plugin-vue/
├── package.json           # Plugin manifest
├── index.js              # Plugin entry point
├── src/
│   └── VueExtractor.js   # Main extractor logic
├── test/
│   ├── fixtures/         # Sample .vue files for testing
│   └── VueExtractor.test.js
└── README.md
```

## package.json

```json
{
  "name": "vibescout-plugin-vue",
  "version": "1.0.0",
  "description": "Vue.js Single File Component support for VibeScout",
  "main": "index.js",
  "type": "module",
  "keywords": [
    "vibescout",
    "vibescout-plugin",
    "vue",
    "vuejs",
    "sfc"
  ],
  "author": "Your Name <you@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/vibescout-plugin-vue.git"
  },
  "vibescout": {
    "apiVersion": "1.0.0",
    "capabilities": ["extractors"],
    "sandbox": {
      "requires": ["fs", "path"],
      "timeout": 30000
    }
  },
  "dependencies": {},
  "devDependencies": {
    "vitest": "^1.0.0"
  }
}
```

## index.js (Plugin Entry Point)

```javascript
/**
 * Vue.js Plugin for VibeScout
 *
 * Adds support for Vue.js Single File Components (.vue)
 */
import { VueExtractor } from "./src/VueExtractor.js";

const plugin = {
  // Required fields
  name: "vue",
  version: "1.0.0",
  apiVersion: "1.0.0",

  // Optional metadata
  description: "Vue.js Single File Component support",
  author: "Your Name",
  homepage: "https://github.com/your-username/vibescout-plugin-vue",

  // Lifecycle hooks
  async initialize(context) {
    context.logger.info("Vue plugin initialized");
  },

  // Capabilities
  extractors: [VueExtractor]
};

export default plugin;
```

## src/VueExtractor.js (Main Logic)

```javascript
/**
 * Vue SFC Extractor
 *
 * Parses Vue Single File Components and extracts:
 * - Component metadata (name, props, emits)
 * - Script setup vs options API
 * - Template structure
 * - Composables usage
 * - Style blocks
 */

import path from "path";

/**
 * Extract Vue-specific metadata from code
 */
function extractVueMetadata(code, filePath) {
  const metadata = {
    framework: "vue",
    componentName: null,
    hasScriptSetup: code.includes("<script setup"),
    hasOptionsAPI: code.includes("export default") && !code.includes("<script setup"),
    hasTemplate: code.includes("<template"),
    hasStyle: code.includes("<style"),
    props: [],
    emits: [],
    composables: [],
    directives: [],
    imports: []
  };

  // Extract component name
  const nameMatch = code.match(/name:\s*['"]([^'"]+)['"]/);
  if (nameMatch) {
    metadata.componentName = nameMatch[1];
  } else {
    // Use filename as component name
    metadata.componentName = path.basename(filePath, ".vue");
  }

  // Extract props (script setup)
  const definePropsMatch = code.match(/defineProps\(\s*{([\s\S]*?)}\s*\)/);
  if (definePropsMatch) {
    const propsText = definePropsMatch[1];
    // Extract prop names
    const propMatches = propsText.matchAll(/(\w+)\s*:/g);
    for (const match of propMatches) {
      metadata.props.push(match[1]);
    }
  }

  // Extract props (options API)
  const optionsPropsMatch = code.match(/props:\s*{([\s\S]*?)}/);
  if (optionsPropsMatch) {
    const propsText = optionsPropsMatch[1];
    const propMatches = propsText.matchAll(/(\w+)\s*:/g);
    for (const match of propMatches) {
      if (!metadata.props.includes(match[1])) {
        metadata.props.push(match[1]);
      }
    }
  }

  // Extract emits
  const defineEmitsMatch = code.match(/defineEmits\(\s*\[([\s\S]*?)\]\s*\)/);
  if (defineEmitsMatch) {
    const emitsText = defineEmitsMatch[1];
    const emitMatches = emitsText.matchAll(/['"]([^'"]+)['"]/g);
    for (const match of emitMatches) {
      metadata.emits.push(match[1]);
    }
  }

  // Extract composables (useX functions)
  const composableMatches = code.matchAll(/use([A-Z]\w+)\(/g);
  for (const match of composableMatches) {
    const composableName = "use" + match[1];
    if (!metadata.composables.includes(composableName)) {
      metadata.composables.push(composableName);
    }
  }

  // Extract custom directives (v-xxx)
  const directiveMatches = code.matchAll(/v-([a-z][a-z0-9-]*)/g);
  for (const match of directiveMatches) {
    const directiveName = match[1];
    // Skip built-in directives
    const builtIns = [
      "if", "else", "else-if", "for", "show", "hide",
      "on", "bind", "model", "slot", "once", "html", "text"
    ];
    if (!builtIns.includes(directiveName) && !metadata.directives.includes(directiveName)) {
      metadata.directives.push(directiveName);
    }
  }

  // Extract imports
  const importMatches = code.matchAll(
    /import\s+(?:(?:{\s*([^}]*?)\s*})|(\*+)\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g
  );
  for (const match of importMatches) {
    const namedImports = match[1];
    const source = match[5];

    if (namedImports) {
      const imports = namedImports.split(",").map((s) => s.trim().split(":")[0].trim());
      metadata.imports.push({ source, symbols: imports });
    } else {
      metadata.imports.push({ source, symbols: ["default"] });
    }
  }

  return metadata;
}

/**
 * Extract template structure
 */
function extractTemplateStructure(code) {
  const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (!templateMatch) {
    return { elements: [], slots: [] };
  }

  const template = templateMatch[1];
  const elements = [];
  const slots = [];

  // Extract custom components (PascalCase)
  const componentMatches = template.matchAll(/<([A-Z][a-zA-Z0-9]*)/g);
  for (const match of componentMatches) {
    const componentName = match[1];
    if (!elements.includes(componentName)) {
      elements.push(componentName);
    }
  }

  // Extract slots
  const slotMatches = template.matchAll(/<slot\s+name=["']([^"']+)["']/g);
  for (const match of slotMatches) {
    const slotName = match[1];
    if (!slots.includes(slotName)) {
      slots.push(slotName);
    }
  }

  return { elements, slots };
}

/**
 * Extract style blocks
 */
function extractStyleBlocks(code) {
  const styles = [];

  // Match all style blocks
  const styleRegex = /<style(?:\s+(scoped|module))?\s*>([\s\S]*?)<\/style>/g;
  let match;

  while ((match = styleRegex.exec(code)) !== null) {
    const modifier = match[1] || null;
    const content = match[2];

    styles.push({
      scoped: modifier === "scoped",
      module: modifier === "module",
      // Count CSS rules
      ruleCount: (content.match(/^[^{]*{/gm) || []).length
    });
  }

  return styles;
}

/**
 * Main Vue Extractor
 */
export const VueExtractor = {
  name: "VueExtractor",
  extensions: [".vue"],
  priority: 10, // Higher than default extractors

  async extract(code, filePath) {
    // Extract Vue-specific metadata
    const vueMetadata = extractVueMetadata(code, filePath);
    const templateStructure = extractTemplateStructure(code);
    const styleBlocks = extractStyleBlocks(code);

    // Create code blocks for each section
    const blocks = [];

    // Template block
    if (vueMetadata.hasTemplate) {
      const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        const templateContent = templateMatch[1];
        const startLine =
          code.substring(0, templateMatch.index).split("\n").length + 1;

        blocks.push({
          name: `${vueMetadata.componentName} (template)`,
          type: "template",
          category: "code",
          startLine: startLine,
          endLine: startLine + templateContent.split("\n").length,
          comments: "",
          content: templateContent,
          filePath
        });
      }
    }

    // Script block
    if (vueMetadata.hasScriptSetup || vueMetadata.hasOptionsAPI) {
      const scriptMatch = code.match(/<script(?:\s+setup)?[^>]*>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        const scriptContent = scriptMatch[1];
        const startLine =
          code.substring(0, scriptMatch.index).split("\n").length + 1;

        // Extract functions/methods
        const functionMatches = scriptContent.matchAll(
          /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\([^)]*\)\s*{))/g
        );

        for (const match of functionMatches) {
          const funcName = match[1] || match[2];
          if (funcName) {
            blocks.push({
              name: funcName,
              type: "function",
              category: "code",
              startLine: startLine,
              endLine: startLine + scriptContent.split("\n").length,
              comments: "",
              content: scriptContent,
              filePath
            });
          }
        }

        // Overall script block
        blocks.push({
          name: `${vueMetadata.componentName} (script)`,
          type: "script",
          category: "code",
          startLine: startLine,
          endLine: startLine + scriptContent.split("\n").length,
          comments: "",
          content: scriptContent,
          filePath
        });
      }
    }

    // Style blocks
    styleBlocks.forEach((style, index) => {
      const styleRegex = /<style(?:\s+(?:scoped|module))?\s*>([\s\S]*?)<\/style>/g;
      let match;
      let matchCount = 0;

      while ((match = styleRegex.exec(code)) !== null) {
        if (matchCount === index) {
          const styleContent = match[1];
          const startLine =
            code.substring(0, match.index).split("\n").length + 1;

          blocks.push({
            name: `${vueMetadata.componentName} (style ${index + 1})`,
            type: "style",
            category: "code",
            startLine: startLine,
            endLine: startLine + styleContent.split("\n").length,
            comments: style.scoped ? "Scoped styles" : style.module ? "CSS modules" : "",
            content: styleContent,
            filePath
          });
          break;
        }
        matchCount++;
      }
    });

    // Return extraction result
    return {
      blocks,
      metadata: {
        imports: vueMetadata.imports,
        exports: [vueMetadata.componentName],
        framework: "vue",
        vue: {
          ...vueMetadata,
          template: templateStructure,
          styles: styleBlocks
        }
      }
    };
  }
};
```

## test/VueExtractor.test.js

```javascript
import { describe, it, expect } from "vitest";
import { VueExtractor } from "../src/VueExtractor.js";

describe("VueExtractor", () => {
  it("should extract component name", async () => {
    const code = `
      <script>
      export default {
        name: 'MyComponent'
      }
      </script>
    `;

    const result = await VueExtractor.extract(code, "/path/to/MyComponent.vue");

    expect(result.metadata.vue.componentName).toBe("MyComponent");
  });

  it("should detect script setup", async () => {
    const code = `
      <script setup>
      const count = ref(0)
      </script>
    `;

    const result = await VueExtractor.extract(code, "/path/to/Test.vue");

    expect(result.metadata.vue.hasScriptSetup).toBe(true);
  });

  it("should extract props", async () => {
    const code = `
      <script setup>
      defineProps({
        title: String,
        count: Number
      })
      </script>
    `;

    const result = await VueExtractor.extract(code, "/path/to/Test.vue");

    expect(result.metadata.vue.props).toContain("title");
    expect(result.metadata.vue.props).toContain("count");
  });

  it("should extract composables", async () => {
    const code = `
      <script setup>
      import { useRoute } from 'vue-router'
      import { useFetch } from '@vueuse/core'

      const route = useRoute()
      const data = useFetch('/api/data')
      </script>
    `;

    const result = await VueExtractor.extract(code, "/path/to/Test.vue");

    expect(result.metadata.vue.composables).toContain("useRoute");
    expect(result.metadata.vue.composables).toContain("useFetch");
  });

  it("should extract custom directives", async () => {
    const code = `
      <template>
        <div v-tooltip="Hover me">Content</div>
        <input v-focus />
      </template>
    `;

    const result = await VueExtractor.extract(code, "/path/to/Test.vue");

    expect(result.metadata.vue.directives).toContain("tooltip");
    expect(result.metadata.vue.directives).toContain("focus");
  });
});
```

## README.md

```markdown
# VibeScout Plugin: Vue.js SFC

[![npm version](https://badge.fury.io/js/vibescout-plugin-vue.svg)](https://www.npmjs.com/package/vibescout-plugin-vue)

Add Vue.js Single File Component (.vue) support to VibeScout.

## Features

- ✅ Extracts component metadata (name, props, emits)
- ✅ Detects Composition API (`<script setup>`) vs Options API
- ✅ Identifies composables usage (useRouter, useFetch, etc.)
- ✅ Extracts template structure and custom components
- ✅ Analyzes style blocks (scoped, CSS modules)
- ✅ Finds custom Vue directives
- ✅ Parses imports and dependencies

## Installation

```bash
npm install -g vibescout-plugin-vue
```

## Usage

The plugin automatically works when VibeScout indexes .vue files:

```bash
vibescout index ./my-vue-app "My Vue App"
```

## Extracted Metadata

```javascript
{
  framework: "vue",
  vue: {
    componentName: "MyComponent",
    hasScriptSetup: true,
    hasOptionsAPI: false,
    hasTemplate: true,
    hasStyle: true,
    props: ["title", "count"],
    emits: ["update", "close"],
    composables: ["useRoute", "useRouter", "useFetch"],
    directives: ["tooltip", "focus"],
    template: {
      elements: ["ChildComponent", "BaseButton"],
      slots: ["header", "footer"]
    },
    styles: [
      { scoped: true, ruleCount: 15 }
    ]
  }
}
```

## Example Queries

```bash
# Find components that use useRouter
vibescout search "components using useRouter"

# Find components with specific props
vibescout search "components with title prop"

# Find components using specific composables
vibescout search "useFetch data fetching"
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Link for local testing
npm link
cd ~/.vibescout/plugins
ln -s /path/to/vibescout-plugin-vue vue
```

## License

MIT
```

## Testing Your Plugin

```bash
# 1. Install dependencies
npm install

# 2. Run tests
npm test

# 3. Link locally for testing
npm link
cd ~/.vibescout/plugins
ln -s /path/to/vibescout-plugin-vue vue

# 4. Test with VibeScout
cd /path/to/your-vue-project
vibescout plugin list
vibescout index . "My Vue App"

# 5. Search for your component
vibescout search "my component feature"
```

## Publishing

```bash
# 1. Update version in package.json
npm version patch

# 2. Publish to npm
npm publish

# 3. Users install with:
npm install -g vibescout-plugin-vue
```
