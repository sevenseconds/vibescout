export const DartStrategy = {
  extensions: [".dart"],
  
  extract: async (code, filePath) => {
    const lines = code.split("\n");
    const blocks = [];
    const metadata = { imports: [], exports: [] };

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
      if (classMatch && !line.startsWith("//") && !line.startsWith("/*")) {
        const name = classMatch[1];
        blocks.push({
          name,
          type: "class",
          startLine: i + 1,
          endLine: i + 1,
          comments: i > 0 && lines[i-1].trim().startsWith("///") ? lines[i-1].trim() : "",
          content: line,
          filePath
        });
      }

      // Method/Function detection (Basic)
      const funcMatch = /(?:void|[a-zA-Z0-9_<>]+\?*)\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/.exec(line);
      if (funcMatch && !line.includes("class") && !line.startsWith("//")) {
        const name = funcMatch[1];
        if (["if", "for", "while", "switch", "catch"].includes(name)) continue;
        
        blocks.push({
          name,
          type: "function",
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