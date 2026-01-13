import fs from "fs-extra";
import path from "path";
import { TypeScriptStrategy } from "./extractors/TypeScriptStrategy.js";
import { MarkdownStrategy } from "./extractors/MarkdownStrategy.js";
import { PythonStrategy } from "./extractors/PythonStrategy.js";
import { GoStrategy } from "./extractors/GoStrategy.js";
import { DartStrategy } from "./extractors/DartStrategy.js";
import { JavaStrategy } from "./extractors/JavaStrategy.js";
import { KotlinStrategy } from "./extractors/KotlinStrategy.js";
import { JsonStrategy } from "./extractors/JsonStrategy.js";
import { TomlStrategy } from "./extractors/TomlStrategy.js";
import { XmlStrategy } from "./extractors/XmlStrategy.js";

// Built-in strategies (priority 0)
const builtinStrategies = [
  TypeScriptStrategy,
  MarkdownStrategy,
  PythonStrategy,
  GoStrategy,
  DartStrategy,
  JavaStrategy,
  KotlinStrategy,
  JsonStrategy,
  TomlStrategy,
  XmlStrategy
];

/**
 * Get all strategies (built-in + plugins).
 * Plugin strategies with higher priority override built-in ones.
 */
async function getAllStrategies() {
  const allStrategies = [...builtinStrategies];

  // Add plugin strategies if registry is available
  try {
    const { getRegistry } = await import("./plugins/registry.js");
    const registry = getRegistry();

    if (registry) {
      const pluginExtractors = registry.getExtractors();
      allStrategies.push(...pluginExtractors);
    }
  } catch (error) {
    // Registry not initialized or plugins not loaded - use built-in only
    // This is expected during early initialization
  }

  return allStrategies;
}

/**
 * Find the best strategy for a file extension.
 * Strategies with higher priority are preferred.
 */
async function findStrategyForExtension(ext) {
  const strategies = await getAllStrategies();

  // Filter strategies that handle this extension
  const matching = strategies.filter(s => s.extensions.includes(ext));

  if (matching.length === 0) {
    return null;
  }

  // Sort by priority (descending), then by name (for consistency)
  matching.sort((a, b) => {
    const priorityA = a.priority || 0;
    const priorityB = b.priority || 0;
    if (priorityA !== priorityB) {
      return priorityB - priorityA; // Higher priority first
    }
    return a.name.localeCompare(b.name);
  });

  return matching[0];
}

/**
 * Strategy Context: Decides which extractor to use based on file extension.
 * Supports built-in strategies and plugin strategies.
 */
export async function extractCodeBlocks(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const code = options.code || await fs.readFile(filePath, "utf-8");

  // Find the matching strategy (plugins can override built-in)
  const strategy = await findStrategyForExtension(ext);

  if (strategy) {
    return strategy.extract(code, filePath, options);
  }

  // Default fallback for unknown files: Index as a single block if text
  return {
    blocks: [{
      name: path.basename(filePath),
      type: "file",
      startLine: 1,
      endLine: code.split("\n").length,
      comments: "",
      content: code,
      filePath
    }],
    metadata: { imports: [], exports: [] }
  };
}