/**
 * VibeScout Plugin Loader
 *
 * Discovers and loads plugins from:
 * - npm packages (vibescout-plugin-*)
 * - Local files (~/.vibescout/plugins/)
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import type {
  VibeScoutPlugin,
  PluginInfo,
  PluginManifest
} from './types.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Plugin API version (increment when breaking changes are made) */
export const PLUGIN_API_VERSION = '1.0.0';

/** Plugin naming pattern for npm packages */
const PLUGIN_NAME_PATTERN = /^vibescout-plugin-/;

/**
 * Discover all available plugins from npm and local directories.
 */
export async function discoverPlugins(): Promise<PluginInfo[]> {
  const plugins: PluginInfo[] = [];

  // Discover local plugins
  const localPlugins = await discoverLocalPlugins();
  plugins.push(...localPlugins);

  // Discover npm plugins
  const npmPlugins = await discoverNpmPlugins();
  plugins.push(...npmPlugins);

  return plugins;
}

/**
 * Discover plugins from local directory (~/.vibescout/plugins/).
 */
async function discoverLocalPlugins(): Promise<PluginInfo[]> {
  const plugins: PluginInfo[] = [];
  const pluginsDir = path.join(os.homedir(), '.vibescout', 'plugins');

  // Ensure plugins directory exists
  await fs.ensureDir(pluginsDir);

  const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

  for (const entry of entries) {
    // Check each directory
    if (entry.isDirectory()) {
      const pluginPath = path.join(pluginsDir, entry.name);
      const manifestPath = path.join(pluginPath, 'package.json');

      // Check if package.json exists
      if (await fs.pathExists(manifestPath)) {
        try {
          const manifest = await fs.readJson(manifestPath);
          const pluginInfo = createPluginInfo(manifest, pluginPath, 'local');
          plugins.push(pluginInfo);
        } catch (error) {
          // Invalid package.json - skip
          console.warn(`[Plugin Loader] Invalid package.json in ${pluginPath}:`, error.message);
        }
      }
    }
  }

  return plugins;
}

/**
 * Discover plugins from npm packages.
 * Looks for packages matching the pattern 'vibescout-plugin-*'.
 */
async function discoverNpmPlugins(): Promise<PluginInfo[]> {
  const plugins: PluginInfo[] = [];

  try {
    // Get the project's node_modules path
    let nodeModulesPath: string;

    // Try multiple locations for node_modules
    const possiblePaths = [
      path.join(process.cwd(), 'node_modules'),
      path.join(__dirname, '..', '..', 'node_modules'),
      // Global npm modules
      path.join(os.homedir(), '.npm', 'global_modules', 'node_modules'),
      path.join(os.homedir(), '.local', 'share', 'npm', 'global', 'node_modules'),
    ];

    for (const testPath of possiblePaths) {
      if (await fs.pathExists(testPath)) {
        nodeModulesPath = testPath;
        break;
      }
    }

    if (!nodeModulesPath) {
      return plugins; // No node_modules found
    }

    const entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });

    for (const entry of entries) {
      // Check if package name matches plugin pattern
      if (entry.isDirectory() && PLUGIN_NAME_PATTERN.test(entry.name)) {
        const pluginPath = path.join(nodeModulesPath, entry.name);
        const manifestPath = path.join(pluginPath, 'package.json');

        if (await fs.pathExists(manifestPath)) {
          try {
            const manifest = await fs.readJson(manifestPath);
            const pluginInfo = createPluginInfo(manifest, pluginPath, 'npm');
            plugins.push(pluginInfo);
          } catch (error) {
            console.warn(`[Plugin Loader] Invalid package.json in ${pluginPath}:`, error.message);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Plugin Loader] Error discovering npm plugins:', error.message);
  }

  return plugins;
}

/**
 * Create plugin info from manifest.
 */
function createPluginInfo(
  manifest: any,
  pluginPath: string,
  source: 'npm' | 'local'
): PluginInfo {
  const hasVibescoutConfig = manifest.vibescout !== undefined;

  return {
    name: manifest.name,
    version: manifest.version,
    source,
    path: pluginPath,
    manifest: {
      name: manifest.name,
      version: manifest.version,
      main: manifest.main || 'index.js',
      vibescout: manifest.vibescout || {
        apiVersion: PLUGIN_API_VERSION,
        capabilities: ['extractors'],
      },
    },
    enabled: true, // Default to enabled
    loaded: false,
  };
}

/**
 * Load a plugin module.
 */
export async function loadPlugin(pluginInfo: PluginInfo): Promise<VibeScoutPlugin | null> {
  const { manifest, path: pluginPath } = pluginInfo;

  // Check if plugin is disabled
  if (!pluginInfo.enabled) {
    return null;
  }

  try {
    // Resolve entry point
    const entryPoint = path.join(pluginPath, manifest.main || 'index.js');

    // Check if entry point exists
    if (!(await fs.pathExists(entryPoint))) {
      throw new Error(`Entry point not found: ${entryPoint}`);
    }

    // Load plugin module
    const module = await import(entryPoint);
    const plugin = module.default || module;

    // Validate plugin interface
    if (!isValidPlugin(plugin)) {
      throw new Error('Plugin does not implement VibeScoutPlugin interface');
    }

    // Check API version compatibility
    if (plugin.apiVersion !== PLUGIN_API_VERSION) {
      throw new Error(
        `Plugin API version mismatch: plugin requires ${plugin.apiVersion}, ` +
        `but VibeScout provides ${PLUGIN_API_VERSION}`
      );
    }

    pluginInfo.loaded = true;
    pluginInfo.error = undefined;

    return plugin;
  } catch (error) {
    pluginInfo.loaded = false;
    pluginInfo.error = error.message;

    console.error(`[Plugin Loader] Failed to load plugin ${pluginInfo.name}:`, error.message);
    return null;
  }
}

/**
 * Validate that an object implements VibeScoutPlugin interface.
 */
function isValidPlugin(plugin: any): boolean {
  if (typeof plugin !== 'object' || plugin === null) {
    return false;
  }

  // Required fields
  if (typeof plugin.name !== 'string') {
    return false;
  }

  if (typeof plugin.version !== 'string') {
    return false;
  }

  if (typeof plugin.apiVersion !== 'string') {
    return false;
  }

  // At least one capability should be present
  const hasCapability =
    Array.isArray(plugin.extractors) ||
    Array.isArray(plugin.providers) ||
    Array.isArray(plugin.commands);

  return hasCapability || plugin.initialize || plugin.activate;
}

/**
 * Get the plugin configuration directory.
 */
export function getPluginsDir(): string {
  return path.join(os.homedir(), '.vibescout', 'plugins');
}

/**
 * Ensure plugins directory exists.
 */
export async function ensurePluginsDir(): Promise<void> {
  await fs.ensureDir(getPluginsDir());
}
