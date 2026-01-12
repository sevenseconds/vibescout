# VibeScout Plugin Architecture

This document describes the high-level architecture of the VibeScout plugin system.

## Overview

The VibeScout plugin system is designed to be:

- **Modular**: Plugins are self-contained and can be developed independently
- **Secure**: Plugins run in sandboxed environments with resource limits
- **Extensible**: Multiple extension points (extractors, providers, commands)
- **Compatible**: Support for both npm packages and local plugins

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         VibeScout CLI                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │ Plugin Discovery │─────▶│ Plugin Loader    │                │
│  │  (npm + local)   │     │  (dynamic import) │                │
│  └──────────────────┘      └────────┬─────────┘                │
│                                      │                           │
│                                      ▼                           │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │ Plugin Registry  │◀─────│ Plugin Sandbox   │                │
│  │  (lifecycle mgmt)│      │  (worker threads)│                │
│  └────────┬─────────┘      └──────────────────┘                │
│           │                                                        │
│           ├──────────────┬──────────────┬──────────────┐        │
│           ▼              ▼              ▼              ▼        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐│
│  │ Extractors  │ │  Providers  │ │  Commands   │ │   Future   ││
│  │             │ │             │ │             │ │ Extensions ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘│
│           │              │              │                        │
│           ▼              ▼              ▼                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   VibeScout Core                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Plugin Discovery

**Location**: `src/plugin-system/loader.ts`

The discovery system finds plugins from two sources:

- **npm packages**: Scans `node_modules/` for packages matching `vibescout-plugin-*`
- **Local files**: Scans `~/.vibescout/plugins/` for local plugin directories

```typescript
async function discoverPlugins(): Promise<PluginInfo[]> {
  const plugins = [];

  // Discover local plugins
  plugins.push(...await discoverLocalPlugins());

  // Discover npm plugins
  plugins.push(...await discoverNpmPlugins());

  return plugins;
}
```

### 2. Plugin Loader

**Location**: `src/plugin-system/loader.ts`

The loader:
1. Reads plugin manifests (`package.json`)
2. Validates plugin interfaces
3. Dynamically imports plugin modules
4. Returns plugin instances

```typescript
async function loadPlugin(info: PluginInfo): Promise<VibeScoutPlugin | null> {
  const entryPoint = path.join(info.path, info.manifest.main);
  const module = await import(entryPoint);
  return module.default || module;
}
```

### 3. Plugin Sandbox

**Location**: `src/plugin-system/sandbox.ts`

The sandbox provides:

- **Timeout protection**: Functions are wrapped with race conditions
- **Error boundaries**: Errors are caught and logged
- **Module whitelist**: Only allowed modules can be imported
- **Memory tracking**: Optional memory usage monitoring

```typescript
function runSandboxed<T>(
  fn: () => T | Promise<T>,
  timeout: number,
  context: string
): Promise<T> {
  return Promise.race([
    fn(),
    createTimeoutPromise(timeout, context)
  ]);
}
```

**Future Enhancements**:
- Worker thread isolation
- CPU throttling
- Network access controls
- File system sandboxing

### 4. Plugin Registry

**Location**: `src/plugin-system/registry.ts`

The registry manages:
- Plugin lifecycle (initialize, activate, deactivate)
- Capability registration (extractors, providers, commands)
- Plugin queries and lookup

```typescript
class PluginRegistry {
  private state: {
    plugins: Map<string, LoadedPlugin>;
    extractors: Map<string, ExtractorPlugin>;
    providers: Map<string, ProviderPlugin>;
    commands: Map<string, CommandPlugin>;
  };

  async loadAll(config): Promise<void>;
  registerExtractor(extractor): void;
  getExtractors(): ExtractorPlugin[];
  // ...
}
```

### 5. Extension Points

#### Extractors

Extend code extraction capabilities:

```typescript
interface ExtractorPlugin {
  name: string;
  extensions: string[];
  priority?: number;
  extract(code: string, filePath: string): Promise<ExtractionResult>;
}
```

**Integration**: `src/extractor.js` queries the registry for extractors matching file extensions.

#### Providers

Extend AI provider capabilities:

```typescript
interface ProviderPlugin {
  name: string;
  type: 'embedding' | 'summarizer';
  generateEmbedding?(text: string): Promise<number[]>;
  summarize?(text: string): Promise<string>;
  // ...
}
```

**Integration**: `src/embeddings.ts` can load plugin providers.

#### Commands

Extend CLI functionality:

```typescript
interface CommandPlugin {
  name: string;
  description: string;
  execute(args: string[], options: Record<string, any>): Promise<void>;
}
```

**Integration**: `src/index.js` registers plugin commands with Commander.js.

## Plugin Lifecycle

```
┌──────────┐   ┌───────────┐   ┌──────────┐   ┌───────────┐
│ Discover │──▶│  Load     │──▶│ Initialize│──▶│  Activate  │
└──────────┘   └───────────┘   └──────────┘   └───────────┘
                   │                                  │
                   ▼                                  ▼
              ┌─────────┐                      ┌───────────┐
              │  Error  │                      │  Ready    │
              └─────────┘                      └───────────┘
                                                   │
                                              (plugins active)
                                                   │
                                              ┌────▼────┐
                                              │Shutdown │
                                              └────┬────┘
                                                   │
                                              ┌────▼────┐
                                              │Deactivate│
                                              └─────────┘
```

1. **Discovery**: Scan for plugins in npm and local directories
2. **Load**: Import plugin modules and validate interfaces
3. **Initialize**: Call `initialize()` hook for each plugin
4. **Activate**: Call `activate()` hook after all plugins are loaded
5. **Ready**: Plugin is active and capabilities are registered
6. **Deactivate**: Call `deactivate()` hook during shutdown

## Security Model

### Current Implementation

- **Timeout protection**: All plugin calls are wrapped with timeout
- **Error boundaries**: Plugin errors don't crash the main process
- **Module whitelist**: Only allowed Node.js modules can be imported

### Configuration

```json
{
  "pluginSystem": {
    "enabled": true,
    "sandboxed": true,
    "timeout": 30000,
    "maxMemory": "512MB",
    "allowedModules": ["fs", "path", "crypto", "os", "util"]
  }
}
```

### Future Enhancements

1. **Worker Thread Isolation**
   - Run plugins in separate worker threads
   - True memory isolation
   - CPU throttling

2. **Capability-Based Security**
   - Declare required capabilities in manifest
   - User grants permissions
   - Audit logging

3. **Resource Limits**
   - Per-plugin memory quotas
   - CPU time limits
   - Network access controls

4. **Plugin Signing**
   - Verify plugin authenticity
   - Detect tampering
   - Trust chains

## Extension Points (Future)

### UI Components

React components for Web UI:

```typescript
interface UIComponentPlugin {
  name: string;
  component: React.ComponentType;
  route?: string;
  menu?: {
    label: string;
    icon: string;
    path: string;
  };
}
```

### Event Hooks

Lifecycle event subscriptions:

```typescript
interface EventHookPlugin {
  onBeforeIndex?(context: IndexContext): Promise<void>;
  onAfterIndex?(context: IndexContext): Promise<void>;
  onBeforeSearch?(query: string): Promise<void>;
  onAfterSearch?(results: SearchResult[]): Promise<SearchResult[]>;
}
```

### Data Sources

Custom data ingestion:

```typescript
interface DataSourcePlugin {
  name: string;
  connect(config: any): Promise<void>;
  ingest(): AsyncIterable<CodeBlock>;
  disconnect(): Promise<void>;
}
```

### Custom File Types

Additional file format support:

```typescript
interface FileTypePlugin {
  extensions: string[];
  mimeType: string;
  parse(content: string): Promise<ParsedContent>;
  render(content: ParsedContent): string;
}
```

## Performance Considerations

### Plugin Discovery

- Lazy loading: Plugins are loaded on-demand
- Caching: Plugin metadata is cached
- Parallel discovery: npm and local plugins are discovered concurrently

### Extraction Performance

- Priority-based selection: Higher priority extractors run first
- Extension routing: Fast file extension lookup
- Batch processing: Multiple files can be processed in parallel

### Provider Performance

- Connection pooling: Reuse connections across requests
- Batch operations: `generateEmbeddingsBatch` for efficiency
- Adaptive throttling: Automatically adjust concurrency

## Error Handling

### Plugin Load Failures

- Failed plugins are logged but don't prevent startup
- Error messages are stored in plugin info
- `vibescout plugin list` shows failed plugins

### Extraction Errors

- Extractors should return partial results on error
- Errors are logged but don't stop indexing
- Fallback to default file extraction

### Provider Errors

- Providers are marked as unavailable on error
- Fallback to alternative providers if configured
- Retry logic for transient failures

## Best Practices

### For Plugin Authors

1. **Keep plugins focused**: Single responsibility per plugin
2. **Handle errors gracefully**: Never throw in extractors
3. **Log appropriately**: Use context.logger for output
4. **Test locally**: Use `~/.vibescout/plugins/` for development
5. **Document dependencies**: List required Node.js modules

### For Core Development

1. **Maintain API stability**: Increment apiVersion on breaking changes
2. **Provide examples**: Include example plugins with each feature
3. **Monitor performance**: Track plugin load times and resource usage
4. **Security first**: Audit all sandbox escape vectors
5. **Backward compatibility**: Support older plugin versions when possible

## References

- [Plugin Development Guide](plugin-guide.md)
- [Plugin API Reference](plugin-api.md)
- [Example Plugins](../src/plugin-system/builtin-extractors/)
