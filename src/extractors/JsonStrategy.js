import Parser from "tree-sitter";
import Json from "tree-sitter-json";

const parser = new Parser();
parser.setLanguage(Json);

export const JsonStrategy = {
  extensions: [".json"],
  
  extract: async (code, filePath) => {
    const tree = parser.parse(code);
    const blocks = [];
    const metadata = { imports: [], exports: [] };
    const lines = code.split("\n");

    function processPair(node) {
      if (node.type === "pair") {
        const keyNode = node.childForFieldName("key");
        if (keyNode) {
          const name = keyNode.text.replace(/['"]/g, "");
          const startLine = node.startPosition.row + 1;
          const endLine = node.endPosition.row + 1;
          const content = node.text;

          blocks.push({ name, type: "key_pair", category: "documentation", startLine, endLine, comments: "", content, filePath });
        }
      }
    }

    // Only extract top-level pairs to avoid over-chunking
    // Check if the tree is valid and has children
    if (tree && tree.rootNode && tree.rootNode.childCount > 0) {
      const root = tree.rootNode.child(0); // usually object or array
      if (root && root.type === "object") {
        for (let i = 0; i < root.childCount; i++) {
          const child = root.child(i);
          if (child && child.type === "pair") processPair(child);
        }
      } else if (code.trim().length > 0) {
        // Fallback: entire file for non-object roots (arrays, primitives)
        blocks.push({
          name: "json_content",
          type: "file",
          category: "documentation",
          startLine: 1,
          endLine: lines.length,
          comments: "",
          content: code,
          filePath
        });
      }
    } else if (code.trim().length > 0) {
      // Fallback for cases where tree-sitter fails but content exists
      blocks.push({
        name: "json_root",
        type: "file",
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
