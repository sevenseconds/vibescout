#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Command } from "commander";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { logger, LogLevel } from "../../common/src/logger.js";
import { configureEnvironment, embeddingManager, summarizerManager, rerankerManager } from "../../common/src/embeddings.js";
import { closeDb, compactDatabase, initDB, clearDatabase } from "../../common/src/db.js";
import { handleIndexFolder, stopIndexing, resetIndexingProgress } from "../../common/src/core.js";
import { server, app } from "../../common/src/server.js";
import { initWatcher } from "../../common/src/watcher.js";
import { loadConfig, interactiveConfig } from "../../common/src/config.js";
import { interactiveSearch } from "./tui.js";
import { createRequire } from "module";
import { getRegistry } from "../../common/src/plugins/registry.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json");
import pkg from "enquirer";
import { fileURLToPath } from "url";
import sirv from "sirv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function handleShutdown() {
  logger.info("\n[Shutdown] Signal received. Cleaning up...");
  stopIndexing();
  await closeDb();
  logger.info("[Shutdown] Cleanup complete. Goodbye!");
  process.exit(0);
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

async function startServer(mode, port, isUI = false) {
  if (mode === "sse" || mode === "http") {
    const isSSE = mode === "sse";
    logger.info(`Starting MCP ${isSSE ? "SSE" : "HTTP"} Server on port ${port}${isUI ? " (with Web UI)" : ""}...`);

    // Load plugins for server mode
    const registry = getRegistry();
    const config = await loadConfig();
    await registry.loadAll(config.plugin || {});
    logger.info(`[Plugin System] Loaded ${registry.getPlugins().length} plugin(s)`);

    // Standardize on /mcp endpoint
    const transport = new StreamableHTTPServerTransport({ endpoint: "/mcp" });
    await server.connect(transport);

    // MCP Transport handler via Hono (using Node.js adapter raw req/res)
    app.all("/mcp", async (c) => {
      // @ts-ignore - node-server specific
      const nodeReq = c.env.incoming;
      // @ts-ignore - node-server specific
      const nodeRes = c.env.outgoing;
      await transport.handleRequest(nodeReq, nodeRes);
    });

    if (isUI) {
      const possiblePaths = [
        path.resolve(__dirname, "../../ui"),           // dist mode (dist/cli/src -> dist/ui)
        path.resolve(__dirname, "../../dist/ui"),      // source mode (cli/src -> dist/ui)
        path.resolve(__dirname, "../../common/src/ui-dist") // legacy/fallback
      ];

      let distPath = possiblePaths.find(p => fs.existsSync(p));

      if (!distPath) {
        logger.warn(`[UI] Warning: UI assets not found in any of: ${possiblePaths.join(", ")}`);
        logger.warn("[UI] Run 'npm run build:ui' to generate the assets.");
        // Fallback to one of them to avoid undefined errors later
        distPath = possiblePaths[0];
      } else {
        logger.info(`[UI] Serving Web UI from: ${distPath}`);
      }

      const staticMiddleware = sirv(distPath, {
        single: true,
        dev: process.env.NODE_ENV !== "production"
      });

      app.use("/*", async (c, next) => {
        // Skip API and MCP
        if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/mcp")) {
          return next();
        }
        
        // Use node-server adapter style to pass to sirv
        // @ts-ignore
        const nodeReq = c.env.incoming;
        // @ts-ignore
        const nodeRes = c.env.outgoing;
        
        if (nodeReq && nodeRes) {
          return new Promise((resolve) => {
            staticMiddleware(nodeReq, nodeRes, () => {
              resolve(next());
            });
          });
        }
        return next();
      });
    }

    serve({
      fetch: app.fetch,
      port,
      hostname: "0.0.0.0"
    });

    if (isUI || !isSSE) {
      if (isUI) console.log(`\nVibeScout Web UI available at: http://localhost:${port}`);
      console.log(`MCP Endpoint available at: http://localhost:${port}/mcp`);
    }
    return;
  }

  if (mode === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("Local Code Search MCP Server running (stdio)");
  }
}

async function main() {
  const config = await loadConfig();
  const program = new Command();

  program
    .name("vibescout")
    .description("Local Code Search MCP Server")
    .version(packageJson.version)
    .option("--models-path <path>", "Path to local models directory", config.modelsPath || process.env.MODELS_PATH)
    .option("--offline", "Force offline mode (disable remote model downloads)", config.offline || process.env.OFFLINE_MODE === "true")
    .option("--mcp [mode]", "MCP transport mode (stdio, sse, http)", "stdio")
    .option("--port <number>", "Port for sse or http mode", config.port || process.env.PORT || 3000)
    .option("--log-level <level>", "Log level (debug, info, warn, error, none)", "info")
    .option("--verbose", "Enable verbose logging (alias for --log-level debug)", config.verbose || false)
    .option("--force", "Force full re-index of all watched projects on startup", false)
    .option("--no-plugins", "Disable plugin system", false)
    .option("--profile", "Enable performance profiling", false)
    .option("--profile-sampling <rate>", "Profiling sampling rate (0.0-1.0)", parseFloat)
    .option("--profile-output <path>", "Profiling output directory");

  program.hook("preAction", async (thisCommand) => {
    const opts = thisCommand.opts();

    let level = LogLevel.INFO;
    if (opts.verbose) {
      level = LogLevel.DEBUG;
    } else {
      switch (opts.logLevel?.toLowerCase()) {
      case "debug": level = LogLevel.DEBUG; break;
      case "info": level = LogLevel.INFO; break;
      case "warn": level = LogLevel.WARN; break;
      case "error": level = LogLevel.ERROR; break;
      case "none": level = LogLevel.NONE; break;
      }
    }
    logger.setLevel(level);

    // Determine which command is being run
    // Check process.argv to see what command was invoked (skip options starting with --)
    const args = process.argv.slice(2);
    const firstCommand = args.find(arg => !arg.startsWith("--"));

    // Commands that don't need any initialization
    const noInitCommands = ["config", "plugin", "provider-plugin", "pp"];
    const needsNoInit = noInitCommands.includes(firstCommand);

    // Commands that need database/providers but NOT file watcher
    const noWatcherCommands = ["compact", "reset", "index", "search"];
    const needsWatcher = !noWatcherCommands.includes(firstCommand) && !needsNoInit;

    // Initialize plugin system (needed for plugin commands)
    if (opts.plugins !== false) {
      const registry = getRegistry();
      await registry.loadAll(config.plugin || {});
      logger.info(`[Plugin System] Loaded ${registry.getPlugins().length} plugin(s)`);
    }

    // Skip all heavy initialization for config and plugin commands
    if (needsNoInit) {
      return;
    }

    configureEnvironment(opts.modelsPath, opts.offline);

    const providerConfig = {
      type: (config.provider === "lmstudio" ? "openai" : config.provider) || "local",
      modelName: config.embeddingModel || "Xenova/bge-small-en-v1.5",
      baseUrl: config.provider === "ollama" ? config.ollamaUrl :
        (config.provider === "openai" || config.provider === "lmstudio") ? config.openaiBaseUrl : undefined,
      apiKey: config.provider === "gemini" ? config.geminiKey :
        config.provider === "cloudflare" ? config.cloudflareToken :
          (config.provider === "zai" || config.provider === "zai-coding") ? config.zaiKey :
            config.openaiKey,
      accountId: config.cloudflareAccountId,
      awsRegion: config.awsRegion,
      awsProfile: config.awsProfile
    };

    const llmConfig = {
      type: (config.llmProvider === "lmstudio" ? "openai" : config.llmProvider || config.provider) || "local",
      modelName: config.llmModel || config.embeddingModel || "Xenova/distilbart-cnn-6-6",
      baseUrl: (config.llmProvider || config.provider) === "ollama" ? config.ollamaUrl :
        ((config.llmProvider || config.provider) === "openai" || (config.llmProvider || config.provider) === "lmstudio") ? config.openaiBaseUrl : undefined,
      apiKey: (config.llmProvider || config.provider) === "gemini" ? config.geminiKey :
        (config.llmProvider || config.provider) === "cloudflare" ? config.cloudflareToken :
          ((config.llmProvider || config.provider) === "zai" || (config.llmProvider || config.provider) === "zai-coding") ? config.zaiKey :
            config.openaiKey,
      accountId: config.cloudflareAccountId,
      awsRegion: config.awsRegion,
      awsProfile: config.awsProfile
    };

    await embeddingManager.setProvider(providerConfig, config.throttlingErrors);
    await summarizerManager.setProvider(llmConfig, config.throttlingErrors);
    await rerankerManager.setProvider({ useReranker: config.useReranker, offline: opts.offline });

    await initDB({
      type: config.dbProvider || "local",
      accountId: config.cloudflareAccountId,
      apiToken: config.cloudflareToken,
      indexName: config.cloudflareVectorizeIndex
    });

    // Only initialize file watcher for server/UI commands
    if (needsWatcher) {
      await initWatcher(!!opts.force);
    }

    // Initialize profiler if enabled via CLI or config
    const profileFromCLI = opts.profile === true;
    const profileFromConfig = config.profiling?.enabled || false;

    if (profileFromCLI || profileFromConfig) {
      const { configureProfiler } = await import("../../common/src/profiler-api.js");

      const samplingRate = opts.profileSampling || config.profiling?.samplingRate || 1.0;
      const outputDir = opts.profileOutput || config.profiling?.outputDir || "~/.vibescout/profiles";
      const categorySampling = config.profiling?.categorySampling || {};

      await configureProfiler({
        enabled: true,
        samplingRate,
        outputDir,
        maxBufferSize: config.profiling?.maxBufferSize || 10000,
        categorySampling
      });

      logger.info(`[Profiler] Enabled with ${Math.round(samplingRate * 100)}% sampling`);
    }
  });

  program
    .command("config")
    .description("Interactive configuration TUI")
    .action(async () => {
      await interactiveConfig();
    });

  program
    .command("ui")
    .description("Start the Web UI")
    .option("--force", "Force full re-index of all watched projects on startup", false)
    .action(async (options) => {
      const opts = program.opts();
      const force = !!options.force || !!opts.force;
      const port = parseInt(opts.port);
      await startServer("http", port, true);
    });

  program
    .command("compact")
    .description("Remove stale files and optimize database storage")
    .action(async () => {
      console.log("Compacting database and removing stale entries...");
      const result = await compactDatabase();
      console.log(`Compact complete! Pruned ${result.pruned} stale files.`);
      if (result.optimized) console.log("Database storage optimized.");
      await closeDb();
    });

  program
    .command("reset")
    .description("Completely clear the local database and cache")
    .option("--force", "Skip confirmation prompt")
    .action(async (options, cmd) => {
      const globalOpts = cmd.parent.opts();
      let proceed = !!options.force || !!globalOpts.force;

      if (!proceed) {
        const prompt = new pkg.Confirm({
          name: "question",
          message: "Are you sure you want to clear the entire database? This cannot be undone."
        });
        proceed = await prompt.run();
      }

      if (proceed) {
        console.log("Clearing database...");
        await clearDatabase();
        resetIndexingProgress();
        console.log("Database cleared successfully.");
      } else {
        console.log("Reset cancelled.");
      }
    });

  program
    .command("index")
    .description("Index a folder")
    .argument("<folderPath>", "Path to the folder to index")
    .argument("[projectName]", "Name of the project (defaults to folder name)")
    .option("--force", "Force a full re-index (clears existing data)", false)
    .action(async (folderPath, projectName, options) => {
      console.log(`Starting indexing for ${folderPath}...`);
      const result = await handleIndexFolder(folderPath, projectName, "default", config.summarize, false, !!options.force);
      console.log(result.content[0].text);
      await closeDb();
    });

  program
    .command("search")
    .description("Search the knowledge base")
    .argument("<query>", "Search query")
    .action(async (query) => {
      await interactiveSearch(query);
      await closeDb();
    });

  // Plugin management commands
  const pluginCommand = program
    .command("plugin")
    .description("Manage plugins");

  pluginCommand
    .command("list")
    .description("List all installed plugins")
    .action(async () => {
      const registry = getRegistry();
      const plugins = await registry.getPluginInfo();

      if (plugins.length === 0) {
        console.log("No plugins found.");
        console.log("\nInstall plugins with: npm install -g vibescout-plugin-<name>");
        console.log("Or add local plugins to: ~/.vibescout/plugins/");
        return;
      }

      console.log("\nInstalled Plugins:\n");
      plugins.forEach(p => {
        const status = p.loaded ? "✓" : "✗";
        const source = p.source === "npm" ? "npm" : "local";
        console.log(`  ${status} ${p.name} v${p.version} (${source})`);
        if (p.error) {
          console.log(`    Error: ${p.error}`);
        }
      });
    });

  pluginCommand
    .command("info")
    .argument("<name>", "Plugin name")
    .description("Show detailed information about a plugin")
    .action(async (name) => {
      const registry = getRegistry();
      const plugins = await registry.getPluginInfo();
      const plugin = plugins.find(p => p.name === name);

      if (!plugin) {
        console.log(`Plugin '${name}' not found.`);
        return;
      }

      console.log(`\nPlugin: ${plugin.name}`);
      console.log(`Version: ${plugin.version}`);
      console.log(`Source: ${plugin.source}`);
      console.log(`Path: ${plugin.path}`);
      console.log(`Status: ${plugin.loaded ? "Loaded" : "Failed"}`);
      if (plugin.manifest.vibescout) {
        console.log(`API Version: ${plugin.manifest.vibescout.apiVersion}`);
        if (plugin.manifest.vibescout.capabilities) {
          console.log(`Capabilities: ${plugin.manifest.vibescout.capabilities.join(", ")}`);
        }
      }
      if (plugin.error) {
        console.log(`Error: ${plugin.error}`);
      }
    });

  pluginCommand
    .command("install")
    .argument("<name>", "Plugin name (will be prefixed with vibescout-plugin- if not already)")
    .description("Install a plugin from npm")
    .option("-g, --global", "Install globally (default)")
    .action(async (name, options) => {
      const { execSync } = await import("child_process");
      const pluginName = name.startsWith("vibescout-plugin-") ? name : `vibescout-plugin-${name}`;
      const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
      const globalFlag = options.global !== false ? "-g" : "";

      try {
        console.log(`Installing ${pluginName}...`);
        const output = execSync(`${cmd} install ${globalFlag} ${pluginName}`, { encoding: "utf-8" });
        console.log(output);
        console.log(`\n✓ Plugin ${pluginName} installed successfully!`);
      } catch (error) {
        console.error(`\n✗ Failed to install ${pluginName}:`);
        console.error(error.stdout || error.stderr || error.message);
        process.exit(1);
      }
    });

  pluginCommand
    .command("uninstall")
    .argument("<name>", "Plugin name")
    .description("Uninstall a plugin")
    .option("-g, --global", "Uninstall globally (default)")
    .action(async (name, options) => {
      const { execSync } = await import("child_process");
      const pluginName = name.startsWith("vibescout-plugin-") ? name : `vibescout-plugin-${name}`;
      const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
      const globalFlag = options.global !== false ? "-g" : "";

      try {
        console.log(`Uninstalling ${pluginName}...`);
        const output = execSync(`${cmd} uninstall ${globalFlag} ${pluginName}`, { encoding: "utf-8" });
        console.log(output);
        console.log(`\n✓ Plugin ${pluginName} uninstalled successfully!`);
      } catch (error) {
        console.error(`\n✗ Failed to uninstall ${pluginName}:`);
        console.error(error.stdout || error.stderr || error.message);
        process.exit(1);
      }
    });

  pluginCommand
    .command("enable")
    .argument("<name>", "Plugin name")
    .description("Enable a disabled plugin")
    .action(async (name) => {
      const { saveConfig } = await import("../../common/src/config.js");
      const config = await loadConfig();

      if (!config.plugin) {
        config.plugin = {};
      }
      if (!config.plugin.disabled) {
        config.plugin.disabled = [];
      }

      // Remove from disabled list
      const index = config.plugin.disabled.indexOf(name);
      if (index === -1) {
        console.log(`Plugin '${name}' is already enabled.`);
        return;
      }

      config.plugin.disabled.splice(index, 1);
      await saveConfig(config);

      // Reload plugins
      const registry = getRegistry();
      await registry.loadAll(config.plugin);

      console.log(`✓ Plugin '${name}' enabled successfully!`);
    });

  pluginCommand
    .command("disable")
    .argument("<name>", "Plugin name")
    .description("Disable a plugin")
    .action(async (name) => {
      const { saveConfig } = await import("../../common/src/config.js");
      const config = await loadConfig();

      if (!config.plugin) {
        config.plugin = {};
      }
      if (!config.plugin.disabled) {
        config.plugin.disabled = [];
      }

      // Add to disabled list
      if (config.plugin.disabled.includes(name)) {
        console.log(`Plugin '${name}' is already disabled.`);
        return;
      }

      config.plugin.disabled.push(name);
      await saveConfig(config);

      // Unload the plugin
      const registry = getRegistry();
      await registry.unloadPlugin(name);

      console.log(`✓ Plugin '${name}' disabled successfully!`);
    });

  // Provider plugin management commands
  const providerPluginCommand = program
    .command("provider-plugin")
    .description("Manage provider plugins (embedding and LLM providers)")
    .alias("pp");

  providerPluginCommand
    .command("list")
    .description("List all installed provider plugins")
    .option("-t, --type <type>", "Filter by type (embedding, llm)")
    .action(async (options) => {
      const registry = getRegistry();

      // Load plugins first
      await registry.loadAll(config.plugin || {});

      const plugins = registry.getProviders();

      if (plugins.length === 0) {
        console.log("No provider plugins found.");
        console.log("\nBuilt-in plugins are in: src/plugins/providers/");
        console.log("User plugins are in: ~/.vibescout/plugins/providers/");
        process.exit(0);
      }

      let filteredPlugins = plugins;
      if (options.type) {
        if (options.type !== "embedding" && options.type !== "llm") {
          console.error(`Error: Invalid type '${options.type}'. Must be 'embedding' or 'llm'.`);
          process.exit(1);
        }
        filteredPlugins = plugins.filter(p => p.type === options.type);
      }

      console.log("\nInstalled Provider Plugins:\n");
      const tableData = filteredPlugins.map(p => ({
        Name: p.name,
        Version: p.version || "N/A",
        Type: p.type,
        Source: "builtin"
      }));

      // Simple table output
      console.table(tableData);
      process.exit(0);
    });

  providerPluginCommand
    .command("info")
    .argument("<name>", "Provider plugin name")
    .description("Show detailed information about a provider plugin")
    .action(async (name) => {
      const registry = getRegistry();

      // Load plugins first
      await registry.loadAll(config.plugin || {});

      const plugin = registry.getProvider(name);

      if (!plugin) {
        console.log(`Provider plugin '${name}' not found.`);
        console.log("\nRun 'vibescout provider-plugin list' to see available plugins.");
        process.exit(1);
      }

      console.log(`\nProvider Plugin: ${plugin.name}`);
      console.log(`Type: ${plugin.type}`);
      console.log(`Version: ${plugin.version || "N/A"}`);
      console.log("Source: builtin");

      if (plugin.configSchema && plugin.configSchema.fields.length > 0) {
        console.log("\nConfiguration Fields:");
        plugin.configSchema.fields.forEach(field => {
          const required = field.required ? "(required)" : "(optional)";
          console.log(`  - ${field.name} [${field.type}] ${required}`);
          if (field.helperText) {
            console.log(`    ${field.helperText}`);
          }
        });
      }

      const methods = [];
      if (plugin.createProvider) methods.push("createProvider");
      if (plugin.validateCredentials) methods.push("validateCredentials");
      if (plugin.testConnection) methods.push("testConnection");

      if (methods.length > 0) {
        console.log(`\nAvailable Methods: ${methods.join(", ")}`);
      }

      process.exit(0);
    });

  providerPluginCommand
    .command("install")
    .argument("<name>", "Provider plugin name (will be prefixed with vibescout-provider- if not already)")
    .description("Install a provider plugin from npm")
    .action(async (name) => {
      const { execSync } = await import("child_process");

      const pluginName = name.startsWith("vibescout-provider-") ? name : `vibescout-provider-${name}`;
      const cmd = process.platform === "win32" ? "npm.cmd" : "npm";

      try {
        console.log(`Installing ${pluginName}...`);

        // Install to user plugins directory
        const pluginsDir = path.join(os.homedir(), ".vibescout", "plugins", "providers");
        await fs.ensureDir(pluginsDir);

        const output = execSync(`${cmd} install ${pluginName} --prefix "${pluginsDir}"`, { encoding: "utf-8" });
        console.log(output);
        console.log(`\n✓ Provider plugin ${pluginName} installed successfully!`);
        console.log(`Location: ${pluginsDir}/${pluginName}`);
        process.exit(0);
      } catch (error) {
        console.error(`\n✗ Failed to install ${pluginName}:`);
        console.error(error.stdout || error.stderr || error.message);
        process.exit(1);
      }
    });

  providerPluginCommand
    .command("uninstall")
    .argument("<name>", "Provider plugin name")
    .description("Uninstall a provider plugin")
    .action(async (name) => {
      const { execSync } = await import("child_process");

      const pluginName = name.startsWith("vibescout-provider-") ? name : `vibescout-provider-${name}`;
      const cmd = process.platform === "win32" ? "npm.cmd" : "npm";

      try {
        const pluginsDir = path.join(os.homedir(), ".vibescout", "plugins", "providers");
        const pluginPath = path.join(pluginsDir, "node_modules", pluginName);

        // Check if plugin exists
        if (!await fs.pathExists(pluginPath)) {
          console.log(`Provider plugin '${name}' is not installed.`);
          process.exit(0);
        }

        console.log(`Uninstalling ${pluginName}...`);
        const output = execSync(`${cmd} uninstall ${pluginName} --prefix "${pluginsDir}"`, { encoding: "utf-8" });
        console.log(output);
        console.log(`\n✓ Provider plugin ${pluginName} uninstalled successfully!`);
        process.exit(0);
      } catch (error) {
        console.error(`\n✗ Failed to uninstall ${pluginName}:`);
        console.error(error.stdout || error.stderr || error.message);
        process.exit(1);
      }
    });

  providerPluginCommand
    .command("validate")
    .argument("<path>", "Path to provider plugin directory")
    .description("Validate a provider plugin manifest and implementation")
    .action(async (pluginPath) => {
      const absolutePath = path.resolve(pluginPath);

      // Check if directory exists
      if (!await fs.pathExists(absolutePath)) {
        console.error(`Error: Directory not found: ${absolutePath}`);
        process.exit(1);
      }

      // Check for package.json
      const packagePath = path.join(absolutePath, "package.json");
      if (!await fs.pathExists(packagePath)) {
        console.error(`Error: package.json not found at ${packagePath}`);
        process.exit(1);
      }

      try {
        const packageContent = await fs.readFile(packagePath, "utf-8");
        const packageJson = JSON.parse(packageContent);

        // Validate vibescout manifest
        if (!packageJson.vibescout) {
          console.error("Error: package.json missing 'vibescout' manifest");
          process.exit(1);
        }

        const manifest = packageJson.vibescout;

        if (manifest.type !== "provider") {
          console.error(`Error: Expected type 'provider', got '${manifest.type}'`);
          process.exit(1);
        }

        if (!["embedding", "llm"].includes(manifest.providerType)) {
          console.error(`Error: Invalid providerType '${manifest.providerType}'. Must be 'embedding' or 'llm'.`);
          process.exit(1);
        }

        console.log("\n✓ package.json is valid");
        console.log(`  Plugin Name: ${packageJson.name}`);
        console.log(`  Version: ${packageJson.version}`);
        console.log(`  Type: ${manifest.type}`);
        console.log(`  Provider Type: ${manifest.providerType}`);
        console.log(`  API Version: ${manifest.apiVersion}`);

        // Check for main entry point
        const mainFile = manifest.main || packageJson.main || "index.js";
        const mainPath = path.join(absolutePath, mainFile);

        if (!await fs.pathExists(mainPath)) {
          console.warn(`\n⚠ Warning: Main file not found: ${mainPath}`);
        } else {
          console.log(`\n✓ Main file found: ${mainFile}`);
        }

        // Check for configSchema (recommended)
        try {
          // Try to load the plugin to check for configSchema
          const pluginModule = await import(absolutePath);
          const plugin = pluginModule.default;

          if (!plugin) {
            console.warn("\n⚠ Warning: Plugin has no default export");
          } else {
            if (plugin.name) console.log(`\n✓ Plugin name: ${plugin.name}`);
            if (plugin.type) console.log(`✓ Plugin type: ${plugin.type}`);
            if (plugin.configSchema) {
              console.log(`✓ Config schema found with ${plugin.configSchema.fields.length} fields`);
            } else {
              console.warn("\n⚠ Warning: No configSchema found. UI won't be able to generate configuration form.");
            }
            if (plugin.createProvider) console.log("✓ createProvider method found");
            if (plugin.validateCredentials) console.log("✓ validateCredentials method found");
            if (plugin.testConnection) console.log("✓ testConnection method found");
          }
        } catch (error) {
          console.warn(`\n⚠ Warning: Could not load plugin module: ${error.message}`);
        }

        console.log("\n✓ Provider plugin validation passed!");
        process.exit(0);
      } catch (error) {
        console.error(`\n✗ Validation failed: ${error.message}`);
        process.exit(1);
      }
    });

  // Profile command for performance profiling
  program
    .command("profile")
    .description("Run a profiling session for a specific operation")
    .argument("<operation>", "Operation to profile (index|search)")
    .option("--folder <path>", "Folder to index (for 'index' operation)")
    .option("--query <text>", "Search query (for 'search' operation)")
    .option("--sampling <rate>", "Sampling rate (0.0-1.0)", "1.0")
    .action(async (operation, options) => {
      const { startProfiling, stopProfiling } = await import("../../common/src/profiler-api.js");

      console.log("Starting profiling session...");
      console.log(`Operation: ${operation}`);
      console.log(`Sampling rate: ${Math.round(parseFloat(options.sampling) * 100)}%`);

      await startProfiling(parseFloat(options.sampling));

      try {
        if (operation === "index") {
          if (!options.folder) {
            console.error("--folder option is required for 'index' operation");
            process.exit(1);
          }
          await handleIndexFolder(options.folder, null, "default", config.summarize, false, false);
        } else if (operation === "search") {
          if (!options.query) {
            console.error("--query option is required for 'search' operation");
            process.exit(1);
          }
          const { handleSearchCode } = await import("../../common/src/core.js");
          await handleSearchCode(options.query);
        } else {
          console.error(`Unknown operation: ${operation}`);
          console.error("Supported operations: index, search");
          process.exit(1);
        }

        const traceInfo = await stopProfiling();

        if (traceInfo) {
          console.log("\n✓ Profiling complete!");
          console.log(`Trace saved to: ${traceInfo.filepath}`);
          console.log(`Events recorded: ${traceInfo.eventCount}`);
          console.log("\nTo view the flame graph:");
          console.log("  1. Open Chrome and navigate to chrome://tracing");
          console.log("  2. Click 'Load' and select the trace file");
          console.log("  3. Zoom and pan to analyze performance");
        } else {
          console.log("\nNo profiling data collected (sampling rate may be too low)");
        }
      } catch (error) {
        console.error(`\n✗ Profiling failed: ${error.message}`);
        await stopProfiling();
        process.exit(1);
      }

      await closeDb();
    });

  program.action(async () => {
    const opts = program.opts();
    const isDefaultMode = program.getOptionValueSource("mcp") === "default";
    if (isDefaultMode && process.stdin.isTTY && process.argv.length === 2) {
      program.help();
      return;
    }
    const mode = opts.mcp === true ? "stdio" : opts.mcp;
    const port = parseInt(opts.port);
    await startServer(mode, port);
  });

  await program.parseAsync(process.argv);
}

main().catch(console.error);
