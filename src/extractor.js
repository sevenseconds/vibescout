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

// Strategy Registry
const strategies = [
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
 * Strategy Context: Decides which extractor to use based on file extension.
 */
export async function extractCodeBlocks(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const code = await fs.readFile(filePath, "utf-8");

  // Find the matching strategy
  const strategy = strategies.find(s => s.extensions.includes(ext));

  if (strategy) {
    return strategy.extract(code, filePath);
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