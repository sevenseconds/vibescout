import Parser from "tree-sitter";
import Java from "tree-sitter-java";

const parser = new Parser();
parser.setLanguage(Java);

const CHUNK_LINE_THRESHOLD = 50;

export const JavaStrategy = {
  extensions: [".java"],
  
  extract: async (code, filePath) => {
    const tree = parser.parse(code);
    const blocks = [];
    const metadata = { imports: [], exports: [] };

    function getComments(node) {
      const commentNodes = [];
      let prev = node.previousSibling;
      while (prev) {
        if (prev.type === "comment" || prev.type === "line_comment" || prev.type === "block_comment") {
          commentNodes.unshift(prev.text);
        } else if (prev.isNamed || prev.text.trim().length > 0) {
          break;
        }
        prev = prev.previousSibling;
      }
      return commentNodes.join("\n");
    }

    function traverse(node) {
      let name = "";
      let type = "";

      if (node.type === "class_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          type = "class";
        }
      } else if (node.type === "interface_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          type = "interface";
        }
      } else if (node.type === "method_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          type = "method";
        }
      } else if (node.type === "constructor_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          type = "constructor";
        }
      }

      if (name) {
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;
        const lineCount = endLine - startLine;
        const comments = getComments(node);
        const content = node.text;

        blocks.push({ name, type, category: "code", startLine, endLine, comments, content, filePath });

        // Chunking
        if (lineCount > CHUNK_LINE_THRESHOLD) {
          const bodyNode = node.childForFieldName("body") || node.children.find(c => c.type === "class_body" || c.type === "interface_body" || c.type === "block");
          if (bodyNode) {
            let currentChunk = [];
            let currentChunkStart = -1;
            let chunkIndex = 1;
            for (let i = 0; i < bodyNode.childCount; i++) {
              const child = bodyNode.child(i);
              if (!child.isNamed) continue;
              if (currentChunkStart === -1) currentChunkStart = child.startPosition.row + 1;
              currentChunk.push(child.text);
              const currentLines = (child.endPosition.row + 1) - currentChunkStart;
              if (["if_statement", "for_statement", "try_statement", "switch_statement"].includes(child.type) || currentLines >= 20) {
                blocks.push({
                  name: `${name} (Chunk ${chunkIndex++})`,
                  type: "chunk", category: "code", parentName: name, startLine: currentChunkStart, endLine: child.endPosition.row + 1,
                  comments, content: currentChunk.join("\n"), filePath
                });
                currentChunk = []; currentChunkStart = -1;
              }
            }
          }
        }
      }

      // Dependency Extraction
      if (node.type === "import_declaration") {
        // e.g. import java.util.List; or import java.util.*;
        const nameNode = node.child(1); // Usually the name
        if (nameNode) {
          const source = nameNode.text;
          const parts = source.split(".");
          const symbols = [parts[parts.length - 1]];
          metadata.imports.push({ source, symbols });
        }
      }

      for (let i = 0; i < node.childCount; i++) traverse(node.child(i));
    }

    traverse(tree.rootNode);
    return { blocks, metadata };
  }
};
