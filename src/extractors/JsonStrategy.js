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
    // Handle JSON without newlines - split by \n but ensure at least one line
    const lines = code.includes("\n") ? code.split("\n") : [code];
    const lineCount = lines.length;

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

    // Check if parsing was successful
    const hasValidTree = tree && tree.rootNode && !tree.rootNode.hasError && tree.rootNode.childCount > 0;

    if (hasValidTree) {
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
          endLine: lineCount,
          comments: "",
          content: code,
          filePath
        });
      }
    } else if (code.trim().length > 0) {
      // Fallback for invalid JSON or parsing failures - still index the content
      // This handles malformed JSON, JSON without EOL, etc.
      blocks.push({
        name: "json_root",
        type: "file",
        category: "documentation",
        startLine: 1,
        endLine: lineCount,
        comments: "",
        content: code,
        filePath
      });
    }

    return { blocks, metadata };
  }
};
