/**
 * VibeScout Plugin System Type Definitions
 *
 * This module defines the core interfaces for the VibeScout plugin system.
 * Plugins can extend VibeScout with custom extractors, providers, and commands.
 */

/**
 * Core plugin interface that all plugins must implement.
 *
 * @example
 * ```typescript
 * const plugin: VibeScoutPlugin = {
 *   name: 'nextjs',
 *   version: '1.0.0',
 *   apiVersion: '1.0.0',
 *   extractors: [ ... ],
 *   providers: [ ... ],
 *   commands: [ ... ]
 * };
 * ```
 */
export interface VibeScoutPlugin {
  /** Unique plugin name (kebab-case) */
  name: string;

  /** Plugin version (semver) */
  version: string;

  /** Plugin API version this plugin is compatible with */
  apiVersion: string;

  /** Optional description of what the plugin does */
  description?: string;

  /** Plugin author/maintainer */
  author?: string;

  /** Homepage URL */
  homepage?: string;

  /**
   * Initialize hook - called when plugin is loaded.
   * Use this to set up any resources or validate configuration.
   */
  initialize?(context: PluginContext): Promise<void> | void;

  /**
   * Activate hook - called after all plugins are loaded.
   * Use this to register capabilities that depend on other plugins.
   */
  activate?(context: PluginContext): Promise<void> | void;

  /**
   * Deactivate hook - called when plugin is unloaded.
   * Use this to clean up resources.
   */
  deactivate?(): Promise<void> | void;

  /** Code extraction capabilities */
  extractors?: ExtractorPlugin[];

  /** AI provider capabilities (embedding, summarizer) */
  providers?: ProviderPlugin[];

  /** CLI command extensions */
  commands?: CommandPlugin[];
}

/**
 * Context provided to plugins during initialization and activation.
 * Gives plugins access to VibeScout's core APIs.
 */
export interface PluginContext {
  /** Current VibeScout configuration */
  config: any;

  /** Logger instance */
  logger: {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
  };

  /** Register a new code extractor */
  registerExtractor(extractor: ExtractorPlugin): void;

  /** Register a new AI provider */
  registerProvider(provider: ProviderPlugin): void;

  /** Register a new CLI command */
  registerCommand(command: CommandPlugin): void;
}

/**
 * Code extractor plugin interface.
 * Extractors parse code files and extract code blocks with metadata.
 */
export interface ExtractorPlugin {
  /** Unique extractor name */
  name: string;

  /** File extensions this extractor handles (e.g., ['.tsx', '.jsx']) */
  extensions: string[];

  /**
   * Priority (higher wins). Default is 0.
   * Use to override built-in extractors.
   */
  priority?: number;

  /**
   * Extract code blocks and metadata from source code.
   *
   * @param code - Source code content
   * @param filePath - Absolute file path
   * @returns Extracted blocks and metadata
   */
  extract(code: string, filePath: string): Promise<ExtractionResult> | ExtractionResult;
}

/**
 * Result of code extraction.
 */
export interface ExtractionResult {
  /** Extracted code blocks (functions, classes, etc.) */
  blocks: CodeBlock[];

  /** Metadata about imports, exports, and framework-specific info */
  metadata: {
    /** Import dependencies */
    imports?: ImportInfo[];

    /** Exported symbols */
    exports?: string[];

    /** Framework-specific metadata (for Next.js, React Router, etc.) */
    framework?: string;
    [key: string]: any;
  };
}

/**
 * A code block (function, class, method, etc.)
 */
export interface CodeBlock {
  /** Symbol/block name */
  name: string;

  /** Block type (function, class, method, chunk) */
  type: string;

  /** Category (code or documentation) */
  category: 'code' | 'documentation';

  /** Start line number (1-indexed) */
  startLine: number;

  /** End line number (1-indexed) */
  endLine: number;

  /** Extracted comments */
  comments: string;

  /** Code content */
  content: string;

  /** File path */
  filePath: string;

  /** Parent symbol name (for chunks) */
  parentName?: string;
}

/**
 * Import dependency information.
 */
export interface ImportInfo {
  /** Module source (e.g., 'next/link', './component') */
  source: string;

  /** Imported symbols */
  symbols: string[];

  /** Whether this is a runtime dependency (not statically imported) */
  runtime?: boolean;
}

/**
 * AI provider plugin interface.
 * Providers implement embedding generation or text summarization.
 */
export interface ProviderPlugin {
  /** Unique provider name */
  name: string;

  /** Provider type (embedding or summarizer) */
  type: 'embedding' | 'summarizer';

  /**
   * Initialize the provider with configuration.
   *
   * @param config - Provider configuration from config.json
   */
  initialize(config: any): Promise<void> | void;

  /**
   * Generate embedding for a single text (for embedding providers).
   */
  generateEmbedding?(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts in batch (for embedding providers).
   */
  generateEmbeddingsBatch?(texts: string[]): Promise<number[][]>;

  /**
   * Summarize text (for summarizer providers).
   */
  summarize?(text: string, maxLength?: number): Promise<string>;

  /**
   * Generate a response from a prompt (for summarizer/LLM providers).
   */
  generateResponse?(prompt: string, context?: string): Promise<string>;

  /**
   * Generate the best question for a code block (for summarizer/LLM providers).
   */
  generateBestQuestion?(code: string, summary: string): Promise<string>;

  /**
   * Check if provider is available and configured.
   */
  isAvailable?(): Promise<boolean> | boolean;
}

/**
 * CLI command plugin interface.
 * Commands add new CLI functionality to VibeScout.
 */
export interface CommandPlugin {
  /** Unique command name */
  name: string;

  /** Command description (shown in help) */
  description: string;

  /** Command arguments (for help text) */
  arguments?: string;

  /**
   * Execute the command.
   *
   * @param args - Parsed command arguments
   * @param options - Command options (flags)
   */
  execute(args: string[], options: Record<string, any>): Promise<void> | void;
}

/**
 * Plugin manifest from package.json.
 */
export interface PluginManifest {
  /** Package name */
  name: string;

  /** Package version */
  version: string;

  /** Main entry point */
  main?: string;

  /** VibeScout plugin configuration */
  vibescout?: {
    /** Required plugin API version */
    apiVersion: string;

    /** Plugin capabilities */
    capabilities?: ('extractors' | 'providers' | 'commands')[];

    /** Version compatibility requirements */
    compatibility?: {
      /** Minimum VibeScout version (inclusive) */
      vibescoutMin?: string;

      /** Maximum VibeScout version (inclusive) */
      vibescoutMax?: string;
    };

    /** Sandbox configuration */
    sandbox?: {
      /** Required Node.js modules (whitelist) */
      requires?: string[];

      /** Maximum execution time (ms) */
      timeout?: number;

      /** Maximum memory usage */
      maxMemory?: string;
    };

    /** Built-in plugin flag */
    builtin?: boolean;
  };

  /** Description */
  description?: string;

  /** Author */
  author?: string;

  /** Homepage */
  homepage?: string;

  /** Keywords */
  keywords?: string[];

  /** License */
  license?: string;
}

/**
 * Plugin information returned by the loader.
 */
export interface PluginInfo {
  /** Plugin name */
  name: string;

  /** Plugin version */
  version: string;

  /** Plugin source (builtin, npm, or local) */
  source: 'builtin' | 'npm' | 'local';

  /** Absolute path to plugin directory */
  path: string;

  /** Plugin manifest */
  manifest: PluginManifest;

  /** Whether plugin is enabled */
  enabled: boolean;

  /** Whether plugin is loaded */
  loaded: boolean;

  /** Load error (if loading failed) */
  error?: string;

  /** Path to overridden plugin (if this plugin overrides another) */
  overridden?: string;

  /** Incompatibility reason (if plugin is incompatible) */
  incompatible?: string;
}

/**
 * Sandbox configuration.
 */
export interface SandboxConfig {
  /** Whether sandboxing is enabled */
  enabled: boolean;

  /** Default timeout (ms) */
  timeout: number;

  /** Default memory limit */
  maxMemory: string;

  /** Allowed Node.js modules (whitelist) */
  allowedModules: string[];
}
