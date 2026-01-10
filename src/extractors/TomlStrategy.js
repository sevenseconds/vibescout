import fs from "fs-extra";
import path from "path";

export const TomlStrategy = {
  extensions: [".toml"],
  
  extract: async (code, filePath) => {
    const lines = code.split("\n");
    const blocks = [];
    const metadata = { imports: [], exports: [] };

    // Regex-based extraction for TOML
    const tableRegex = /^\s*\[([^\]]+)\]/gm;
    let match;

    while ((match = tableRegex.exec(code)) !== null) {
      const tableName = match[1].trim();
      const startLine = code.substring(0, match.index).split("\n").length;
      
      blocks.push({
        name: tableName,
        type: "table",
        startLine,
        endLine: startLine,
        comments: "",
        content: match[0],
        filePath
      });
    }

    // Always include root block
    blocks.push({
      name: "toml_root",
      type: "file",
      startLine: 1,
      endLine: lines.length,
      comments: "",
      content: code.substring(0, 5000),
      filePath
    });

    return { blocks, metadata };
  }
};