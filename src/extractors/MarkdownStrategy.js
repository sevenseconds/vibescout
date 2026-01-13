import Parser from "tree-sitter";
import Markdown from "tree-sitter-markdown";
import path from "path";

const parser = new Parser();
try {
  parser.setLanguage(Markdown);
} catch {
  // Silent fallback
}

export const MarkdownStrategy = {
  extensions: [".md"],

  extract: async (code, filePath, options = {}) => {
    const blocks = [];
    const metadata = { imports: [], exports: [] };
    const lines = code.split("\n");
    const chunking = options.chunking || 'headings';

    // 1. No Chunking: Treat the entire file as a single block
    if (chunking === 'none') {
      if (code.trim().length > 0) {
        blocks.push({
          name: `Doc: ${path.basename(filePath)}`,
          type: "documentation",
          category: "documentation",
          startLine: 1,
          endLine: lines.length,
          comments: "",
          content: code,
          filePath
        });
      }
      return { blocks, metadata };
    }

    // 2. Paragraph Chunking: Split by double newlines
    if (chunking === 'paragraphs') {
      const paragraphs = code.split(/\n\s*\n/);
      let currentLine = 1;
      
      for (let i = 0; i < paragraphs.length; i++) {
        const content = paragraphs[i].trim();
        if (!content) continue;
        
        const paraLines = content.split('\n').length;
        blocks.push({
          name: `Doc: ${path.basename(filePath)} (Para ${i + 1})`,
          type: "documentation",
          category: "documentation",
          startLine: currentLine,
          endLine: currentLine + paraLines - 1,
          comments: "",
          content: content,
          filePath
        });
        currentLine += paraLines + 1; // +1 for the gap
      }
      return { blocks, metadata };
    }

    // 3. Headings Chunking (Default): Split by markdown headers
    try {
      const tree = parser.parse(code);
      function traverse(node) {
        if (node.type === "atx_heading" || node.type === "setext_heading") {
          const name = node.text.replace(/^#+\s*/, "").trim();
          const startLine = node.startPosition.row + 1;
          
          let endLine = lines.length;
          let next = node.nextNamedSibling;
          while (next) {
            if (next.type === "atx_heading" || next.type === "setext_heading") {
              endLine = next.startPosition.row;
              break;
            }
            next = next.nextNamedSibling;
          }

          blocks.push({
            name: `Doc: ${name}`,
            type: "documentation",
            category: "documentation",
            startLine,
            endLine,
            comments: "",
            content: lines.slice(startLine - 1, endLine).join("\n"),
            filePath
          });
        }
        for (let i = 0; i < node.childCount; i++) traverse(node.child(i));
      }
      traverse(tree.rootNode);
    } catch {
      // Fallback
      const sections = code.split(/^(?=# )|^(?=## )|^(?=### )/m);
      for (const section of sections) {
        if (!section.trim()) continue;
        const headingLines = section.split("\n");
        const headingMatch = headingLines[0].match(/^#+\s*(.*)/);
        const name = headingMatch ? headingMatch[1].trim() : path.basename(filePath);
        blocks.push({
          name: `Doc: ${name}`,
          type: "documentation",
          category: "documentation",
          startLine: 1,
          endLine: headingLines.length,
          comments: "",
          content: section.trim(),
          filePath
        });
      }
    }

    if (blocks.length === 0 && code.trim().length > 0) {
      blocks.push({
        name: `Doc: ${path.basename(filePath)}`,
        type: "documentation",
        category: "documentation",
        startLine: 1,
        endLine: lines.length,
        comments: "",
        content: code,
        filePath
      });
    }

    return { blocks, metadata };
  }
};