/**
 * VibeScout Plugin Sandbox
 *
 * Provides isolated execution environment for plugins.
 * Currently uses function wrapping with timeout protection.
 * Future enhancement: Use worker_threads for true isolation.
 */

import type {
  VibeScoutPlugin,
  PluginContext,
  SandboxConfig,
  ExtractorPlugin,
  ProviderPlugin,
  CommandPlugin
} from './types.js';

/**
 * Default sandbox configuration.
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: true,
  timeout: 30000, // 30 seconds
  maxMemory: '512MB',
  allowedModules: ['fs', 'path', 'crypto', 'os', 'util'],
};

/**
 * Create a sandboxed plugin wrapper.
 *
 * The sandbox intercepts all plugin calls and enforces:
 * - Timeout limits
 * - Error boundaries
 * - (Future) Resource limits
 * - (Future) Module access control
 */
export function createSandboxedPlugin(
  plugin: VibeScoutPlugin,
  config: Partial<SandboxConfig> = {}
): VibeScoutPlugin {
  const sandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, ...config };

  // Sandbox lifecycle hooks
  const sandboxedPlugin: VibeScoutPlugin = {
    ...plugin,
  };

  // Wrap initialize hook
  if (plugin.initialize) {
    sandboxedPlugin.initialize = (context: PluginContext) => {
      return runSandboxed(
        () => plugin.initialize!(context),
        sandboxConfig.timeout,
        `Plugin ${plugin.name}.initialize`
      );
    };
  }

  // Wrap activate hook
  if (plugin.activate) {
    sandboxedPlugin.activate = (context: PluginContext) => {
      return runSandboxed(
        () => plugin.activate!(context),
        sandboxConfig.timeout,
        `Plugin ${plugin.name}.activate`
      );
    };
  }

  // Wrap deactivate hook
  if (plugin.deactivate) {
    sandboxedPlugin.deactivate = () => {
      return runSandboxed(
        () => plugin.deactivate!(),
        sandboxConfig.timeout,
        `Plugin ${plugin.name}.deactivate`
      );
    };
  }

  // Sandbox extractors
  if (plugin.extractors) {
    sandboxedPlugin.extractors = plugin.extractors.map(extractor =>
      createSandboxedExtractor(extractor, plugin.name, sandboxConfig)
    );
  }

  // Sandbox providers
  if (plugin.providers) {
    sandboxedPlugin.providers = plugin.providers.map(provider =>
      createSandboxedProvider(provider, plugin.name, sandboxConfig)
    );
  }

  // Sandbox commands
  if (plugin.commands) {
    sandboxedPlugin.commands = plugin.commands.map(command =>
      createSandboxedCommand(command, plugin.name, sandboxConfig)
    );
  }

  return sandboxedPlugin;
}

/**
 * Create a sandboxed extractor.
 */
function createSandboxedExtractor(
  extractor: ExtractorPlugin,
  pluginName: string,
  config: SandboxConfig
): ExtractorPlugin {
  return {
    ...extractor,
    extract: (code: string, filePath: string) => {
      return runSandboxed(
        () => extractor.extract(code, filePath),
        config.timeout,
        `Extractor ${pluginName}:${extractor.name}.extract`
      );
    },
  };
}

/**
 * Create a sandboxed provider.
 */
function createSandboxedProvider(
  provider: ProviderPlugin,
  pluginName: string,
  config: SandboxConfig
): ProviderPlugin {
  const sandboxedProvider: ProviderPlugin = {
    ...provider,
  };

  // Wrap all async methods
  if (provider.initialize) {
    sandboxedProvider.initialize = (cfg: any) => {
      return runSandboxed(
        () => provider.initialize!(cfg),
        config.timeout,
        `Provider ${pluginName}:${provider.name}.initialize`
      );
    };
  }

  if (provider.generateEmbedding) {
    sandboxedProvider.generateEmbedding = (text: string) => {
      return runSandboxed(
        () => provider.generateEmbedding!(text),
        config.timeout,
        `Provider ${pluginName}:${provider.name}.generateEmbedding`
      );
    };
  }

  if (provider.generateEmbeddingsBatch) {
    sandboxedProvider.generateEmbeddingsBatch = (texts: string[]) => {
      return runSandboxed(
        () => provider.generateEmbeddingsBatch!(texts),
        config.timeout,
        `Provider ${pluginName}:${provider.name}.generateEmbeddingsBatch`
      );
    };
  }

  if (provider.summarize) {
    sandboxedProvider.summarize = (text: string, maxLength?: number) => {
      return runSandboxed(
        () => provider.summarize!(text, maxLength),
        config.timeout,
        `Provider ${pluginName}:${provider.name}.summarize`
      );
    };
  }

  if (provider.generateResponse) {
    sandboxedProvider.generateResponse = (prompt: string, context?: string) => {
      return runSandboxed(
        () => provider.generateResponse!(prompt, context),
        config.timeout,
        `Provider ${pluginName}:${provider.name}.generateResponse`
      );
    };
  }

  if (provider.generateBestQuestion) {
    sandboxedProvider.generateBestQuestion = (code: string, summary: string) => {
      return runSandboxed(
        () => provider.generateBestQuestion!(code, summary),
        config.timeout,
        `Provider ${pluginName}:${provider.name}.generateBestQuestion`
      );
    };
  }

  return sandboxedProvider;
}

/**
 * Create a sandboxed command.
 */
function createSandboxedCommand(
  command: CommandPlugin,
  pluginName: string,
  config: SandboxConfig
): CommandPlugin {
  return {
    ...command,
    execute: (args: string[], options: Record<string, any>) => {
      return runSandboxed(
        () => command.execute(args, options),
        config.timeout,
        `Command ${pluginName}:${command.name}.execute`
      );
    },
  };
}

/**
 * Run a function in a sandbox with timeout protection.
 */
async function runSandboxed<T>(
  fn: () => T | Promise<T>,
  timeout: number,
  context: string
): Promise<T> {
  return Promise.race([
    fn(),
    createTimeoutPromise(timeout, context),
  ]);
}

/**
 * Create a timeout promise that rejects after specified duration.
 */
function createTimeoutPromise(timeout: number, context: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Sandbox timeout: ${context} exceeded ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Validate that a plugin's requested modules are allowed.
 *
 * @param requested - Array of module names the plugin wants to use
 * @param allowed - Array of allowed module names
 * @returns Array of disallowed modules (empty if all are allowed)
 */
export function validateModuleAccess(
  requested: string[],
  allowed: string[]
): string[] {
  const disallowed = requested.filter(mod => !allowed.includes(mod));

  if (disallowed.length > 0) {
    console.warn(
      `[Sandbox] Plugin requested disallowed modules: ${disallowed.join(', ')}`
    );
  }

  return disallowed;
}

/**
 * Memory limit tracking (basic implementation).
 *
 * Note: This is a simplified implementation. For true memory limits,
 * we would need to use worker_threads with resource constraints.
 */
export class MemoryTracker {
  private initialMemory: NodeJS.MemoryUsage;

  constructor() {
    this.initialMemory = process.memoryUsage();
  }

  /**
   * Get current memory usage.
   */
  getCurrentUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * Get memory usage delta since tracking started.
   */
  getDelta(): NodeJS.MemoryUsage {
    const current = process.memoryUsage();
    return {
      rss: current.rss - this.initialMemory.rss,
      heapTotal: current.heapTotal - this.initialMemory.heapTotal,
      heapUsed: current.heapUsed - this.initialMemory.heapUsed,
      external: current.external - this.initialMemory.external,
      arrayBuffers: current.arrayBuffers - this.initialMemory.arrayBuffers,
    };
  }

  /**
   * Format memory size to human-readable string.
   */
  static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

/**
 * Create a memory-tracked sandbox session.
 */
export function createMemoryTrackedSession(): {
  tracker: MemoryTracker;
  checkLimit: (limit: string) => boolean;
} {
  const tracker = new MemoryTracker();

  return {
    tracker,
    checkLimit: (limit: string) => {
      const delta = tracker.getDelta();
      const currentUsage = delta.heapUsed;

      // Parse limit (e.g., "512MB" -> 512 * 1024 * 1024)
      const limitBytes = parseMemoryLimit(limit);

      return currentUsage <= limitBytes;
    },
  };
}

/**
 * Parse memory limit string to bytes.
 */
function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);

  if (!match) {
    throw new Error(`Invalid memory limit format: ${limit}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  return value * multipliers[unit];
}
