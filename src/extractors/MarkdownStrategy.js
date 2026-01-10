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

  extract: async (code, filePath) => {
    const blocks = [];
    const metadata = { imports: [], exports: [] };

    try {
      const tree = parser.parse(code);
      function traverse(node) {
        if (node.type === "atx_heading" || node.type === "setext_heading") {
          const name = node.text.replace(/^#+\s*/, "").trim();
          const startLine = node.startPosition.row + 1;
          
          let endLine = code.split("\n").length;
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
            startLine,
            endLine,
            comments: "",
            content: code.split("\n").slice(startLine - 1, endLine).join("\n"),
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
        const headingMatch = section.split("\n")[0].match(/^#+\s*(.*)/);
        const name = headingMatch ? headingMatch[1].trim() : path.basename(filePath);
        blocks.push({
          name: `Doc: ${name}`,
          type: "documentation",
          startLine: 1,
          endLine: section.split("\n").length,
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
        startLine: 1,
        endLine: code.split("\n").length,
        comments: "",
        content: code,
        filePath
      });
    }

    return { blocks, metadata };
  }
};