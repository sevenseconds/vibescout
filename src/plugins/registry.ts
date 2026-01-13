/**
 * VibeScout Plugin Registry
 *
 * Manages plugin lifecycle, registration, and capability access.
 */

import { discoverPlugins, loadPlugin } from './loader.js';
import { createSandboxedPlugin, DEFAULT_SANDBOX_CONFIG } from './sandbox.js';
import { debugStore } from '../debug.js';
import type {
  VibeScoutPlugin,
  PluginInfo,
  ExtractorPlugin,
  ProviderPlugin,
  CommandPlugin,
  PluginContext,
  SandboxConfig
} from './types.js';

/**
 * Plugin registry state.
 */
interface RegistryState {
  plugins: Map<string, LoadedPlugin>;
  extractors: Map<string, ExtractorPlugin>;
  providers: Map<string, ProviderPlugin>;
  commands: Map<string, CommandPlugin>;
}

/**
 * Loaded plugin with metadata.
 */
interface LoadedPlugin {
  info: PluginInfo;
  plugin: VibeScoutPlugin;
  context: PluginContext;
}

/**
 * Global registry instance.
 */
let globalRegistry: PluginRegistry | null = null;

/**
 * Get the global plugin registry instance.
 */
export function getRegistry(): PluginRegistry {
  if (!globalRegistry) {
    globalRegistry = new PluginRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (useful for testing).
 */
export function resetRegistry(): void {
  globalRegistry = null;
}

/**
 * Plugin registry class.
 *
 * Manages plugin discovery, loading, lifecycle, and capability registration.
 */
export class PluginRegistry {
  private state: RegistryState = {
    plugins: new Map(),
    extractors: new Map(),
    providers: new Map(),
    commands: new Map(),
  };

  private config: any;
  private logger: any;

  constructor(config?: any, logger?: any) {
    this.config = config || {};
    this.logger = logger || console;
  }

  /**
   * Discover and load all available plugins.
   */
  async loadAll(pluginConfig?: { enabled?: boolean; disabled?: string[]; sandboxed?: boolean }): Promise<void> {
    const { enabled = true, disabled = [], sandboxed = true } = pluginConfig || {};

    // Plugins are disabled globally
    if (!enabled) {
      this.logger.info('[Plugin Registry] Plugins are disabled');
      return;
    }

    // Discover plugins
    const discovered = await discoverPlugins();

    this.logger.info(`[Plugin Registry] Discovered ${discovered.length} plugin(s)`);

    // Load each plugin
    for (const info of discovered) {
      // Skip if disabled
      if (disabled.includes(info.name)) {
        this.logger.info(`[Plugin Registry] Plugin ${info.name} is disabled`);
        continue;
      }

      await this.loadPlugin(info, sandboxed);
    }

    // Activate all plugins
    await this.activateAll();
  }

  /**
   * Load a single plugin.
   */
  async loadPlugin(info: PluginInfo, sandboxed: boolean = true): Promise<boolean> {
    try {
      // Load plugin module
      const pluginModule = await loadPlugin(info);

      if (!pluginModule) {
        return false;
      }

      // Apply sandbox if enabled
      const plugin = sandboxed
        ? createSandboxedPlugin(pluginModule, this.getPluginConfig(info.name))
        : pluginModule;

      // Create plugin context
      const context: PluginContext = {
        config: this.config,
        logger: this.createPluginLogger(info.name),
        debugStore,
        registerExtractor: (extractor: ExtractorPlugin) => this.registerExtractor(extractor),
        registerProvider: (provider: ProviderPlugin) => this.registerProvider(provider),
        registerCommand: (command: CommandPlugin) => this.registerCommand(command),
      };

      // Initialize plugin
      if (plugin.initialize) {
        await plugin.initialize(context);
      }

      // Store plugin
      this.state.plugins.set(info.name, {
        info,
        plugin,
        context,
      });

      this.logger.info(`[Plugin Registry] Loaded plugin ${info.name} v${info.version}`);

      return true;
    } catch (error) {
      this.logger.error(`[Plugin Registry] Failed to load plugin ${info.name}:`, error.message);
      return false;
    }
  }

  /**
   * Activate all loaded plugins.
   */
  async activateAll(): Promise<void> {
    for (const [name, loaded] of this.state.plugins) {
      try {
        if (loaded.plugin.activate) {
          await loaded.plugin.activate(loaded.context);
          this.logger.debug(`[Plugin Registry] Activated plugin ${name}`);
        }
      } catch (error) {
        this.logger.error(`[Plugin Registry] Failed to activate plugin ${name}:`, error.message);
      }
    }
  }

  /**
   * Register an extractor.
   */
  registerExtractor(extractor: ExtractorPlugin): void {
    const key = `${extractor.name}:${extractor.extensions.join(',')}`;
    this.state.extractors.set(key, extractor);
    this.logger.debug(`[Plugin Registry] Registered extractor ${extractor.name}`);
  }

  /**
   * Register a provider.
   */
  registerProvider(provider: ProviderPlugin): void {
    const key = `${provider.type}:${provider.name}`;
    this.state.providers.set(key, provider);
    this.logger.debug(`[Plugin Registry] Registered provider ${provider.name}`);
  }

  /**
   * Register a command.
   */
  registerCommand(command: CommandPlugin): void {
    this.state.commands.set(command.name, command);
    this.logger.debug(`[Plugin Registry] Registered command ${command.name}`);
  }

  /**
   * Get all registered extractors.
   */
  getExtractors(): ExtractorPlugin[] {
    return Array.from(this.state.extractors.values());
  }

  /**
   * Get extractors for a file extension.
   */
  getExtractorsForExtension(extension: string): ExtractorPlugin[] {
    return this.getExtractors().filter(extractor =>
      extractor.extensions.includes(extension)
    );
  }

  /**
   * Get all registered providers.
   */
  getProviders(): ProviderPlugin[] {
    return Array.from(this.state.providers.values());
  }

  /**
   * Get providers by type.
   */
  getProvidersByType(type: 'embedding' | 'llm'): ProviderPlugin[] {
    return this.getProviders().filter(provider => provider.type === type);
  }

  /**
   * Get provider by name and type.
   */
  getProvider(name: string, type?: 'embedding' | 'llm'): ProviderPlugin | undefined {
    // If type is specified, use it. Otherwise search by name only.
    if (type) {
      const key = `${type}:${name}`;
      return this.state.providers.get(key);
    }

    // Search by name only
    return this.getProviders().find(provider => provider.name === name);
  }

  /**
   * Get all registered commands.
   */
  getCommands(): CommandPlugin[] {
    return Array.from(this.state.commands.values());
  }

  /**
   * Get command by name.
   */
  getCommand(name: string): CommandPlugin | undefined {
    return this.state.commands.get(name);
  }

  /**
   * Get all loaded plugins.
   */
  getPlugins(): LoadedPlugin[] {
    return Array.from(this.state.plugins.values());
  }

  /**
   * Get plugin by name.
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.state.plugins.get(name);
  }

  /**
   * Get plugin info for all plugins (including failed loads).
   */
  async getPluginInfo(): Promise<PluginInfo[]> {
    return await discoverPlugins();
  }

  /**
   * Unload a plugin.
   */
  async unloadPlugin(name: string): Promise<boolean> {
    const loaded = this.state.plugins.get(name);

    if (!loaded) {
      return false;
    }

    try {
      // Deactivate plugin
      if (loaded.plugin.deactivate) {
        await loaded.plugin.deactivate();
      }

      // Remove registered capabilities
      for (const [key, extractor] of this.state.extractors) {
        // Check if extractor belongs to this plugin
        if (extractor.name.startsWith(`${name}:`)) {
          this.state.extractors.delete(key);
        }
      }

      for (const [key, provider] of this.state.providers) {
        if (provider.name.startsWith(`${name}:`)) {
          this.state.providers.delete(key);
        }
      }

      this.state.commands.delete(name);

      // Remove plugin
      this.state.plugins.delete(name);

      this.logger.info(`[Plugin Registry] Unloaded plugin ${name}`);
      return true;
    } catch (error) {
      this.logger.error(`[Plugin Registry] Failed to unload plugin ${name}:`, error.message);
      return false;
    }
  }

  /**
   * Shutdown all plugins.
   */
  async shutdown(): Promise<void> {
    const pluginNames = Array.from(this.state.plugins.keys());

    for (const name of pluginNames) {
      await this.unloadPlugin(name);
    }
  }

  /**
   * Get plugin-specific configuration.
   */
  private getPluginConfig(pluginName: string): Partial<SandboxConfig> {
    const pluginsConfig = this.config.plugin || {};

    return {
      enabled: pluginsConfig.enabled !== false,
      timeout: pluginsConfig.timeout || DEFAULT_SANDBOX_CONFIG.timeout,
      maxMemory: pluginsConfig.maxMemory || DEFAULT_SANDBOX_CONFIG.maxMemory,
      allowedModules: pluginsConfig.allowedModules || DEFAULT_SANDBOX_CONFIG.allowedModules,
    };
  }

  /**
   * Create a namespaced logger for a plugin.
   */
  private createPluginLogger(pluginName: string): any {
    return {
      debug: (message: string, ...args: any[]) => {
        this.logger.debug(`[Plugin:${pluginName}] ${message}`, ...args);
      },
      info: (message: string, ...args: any[]) => {
        this.logger.info(`[Plugin:${pluginName}] ${message}`, ...args);
      },
      warn: (message: string, ...args: any[]) => {
        this.logger.warn(`[Plugin:${pluginName}] ${message}`, ...args);
      },
      error: (message: string, ...args: any[]) => {
        this.logger.error(`[Plugin:${pluginName}] ${message}`, ...args);
      },
    };
  }
}
