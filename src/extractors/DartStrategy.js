import path from "path";

export const DartStrategy = {
  extensions: [".dart"],
  extract: async (code, filePath, options = {}) => {
    const lines = code.split("\n");
    const blocks = [];
    const metadata = { imports: [], exports: [] };
    const chunking = options.chunking || "granular";

    // 1. No Chunking: Treat the entire file as a single unit
    if (chunking === "none") {
      if (code.trim().length > 0) {
        blocks.push({
          name: path.basename(filePath),
          type: "file",
          category: "code",
          startLine: 1,
          endLine: lines.length,
          comments: "",
          content: code,
          filePath
        });
      }
    }

    // Regex-based extraction for Dart
    const importRegex = /import\s+['"]([^'"]+)['"]/g;
    const exportRegex = /export\s+['"]([^'"]+)['"]/g;

    // 1. Extract Imports
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      metadata.imports.push({ source: match[1], symbols: [] });
    }

    // 2. Extract Exports
    while ((match = exportRegex.exec(code)) !== null) {
      metadata.exports.push(match[1]);
    }

    // 3. Extract Classes and Methods (Simple Line-based detection)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Class detection
      const classMatch = /class\s+([a-zA-Z0-9_]+)/.exec(line);
      if (classMatch && !line.startsWith("//") && !line.startsWith("/*") && chunking === "granular") {
        const name = classMatch[1];
        blocks.push({
          name,
          type: "class",
          category: "code",
          startLine: i + 1,
          endLine: i + 1,
          comments: i > 0 && lines[i-1].trim().startsWith("///") ? lines[i-1].trim() : "",
          content: line,
          filePath
        });
      }

      // Method/Function detection (Basic)
      const funcMatch = /(?:void|[a-zA-Z0-9_<>]+\?*)\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/.exec(line);
      if (funcMatch && !line.includes("class") && !line.startsWith("//") && chunking === "granular") {
        const name = funcMatch[1];
        if (["if", "for", "while", "switch", "catch"].includes(name)) continue;
        
        blocks.push({
          name,
          type: "function",
          category: "code",
          startLine: i + 1,
          endLine: i + 1,
          comments: i > 0 && lines[i-1].trim().startsWith("///") ? lines[i-1].trim() : "",
          content: line,
          filePath
        });
      }
    }

    return { blocks, metadata };
  }
};