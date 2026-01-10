import Parser from "tree-sitter";
import Go from "tree-sitter-go";

const parser = new Parser();
parser.setLanguage(Go);

const CHUNK_LINE_THRESHOLD = 50;

export const GoStrategy = {
  extensions: [".go"],
  
  extract: async (code, filePath) => {
    const tree = parser.parse(code);
    const blocks = [];
    const metadata = { imports: [], exports: [] };

    function getComments(node) {
      const commentNodes = [];
      const targetNode = node.type === "type_spec" ? node.parent : node;
      let prev = targetNode.previousSibling;
      while (prev) {
        if (prev.type === "comment") {
          commentNodes.unshift(prev.text);
        } else if (prev.isNamed) {
          break;
        }
        prev = prev.previousSibling;
      }
      return commentNodes.join("\n");
    }

    function traverse(node) {
      let name = "";
      let type = "";

      if (node.type === "type_spec") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          type = "type";
        }
      } else if (node.type === "function_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          type = "function";
        }
      } else if (node.type === "method_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          type = "method";
        }
      }

      if (name) {
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;
        const lineCount = endLine - startLine;
        const comments = getComments(node);
        const content = node.text;

        blocks.push({ name, type, startLine, endLine, comments, content, filePath });

        // Chunking
        if (lineCount > CHUNK_LINE_THRESHOLD) {
          const bodyNode = node.childForFieldName("body") || node.children.find(c => c.type === "field_declaration_list" || c.type === "block");
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
              if (["if_statement", "for_statement", "switch_statement", "select_statement"].includes(child.type) || currentLines >= 20) {
                blocks.push({
                  name: `${name} (Chunk ${chunkIndex++})`,
                  type: "chunk", parentName: name, startLine: currentChunkStart, endLine: child.endPosition.row + 1,
                  comments, content: currentChunk.join("\n"), filePath
                });
                currentChunk = []; currentChunkStart = -1;
              }
            }
          }
        }
      }

      // Dependency Extraction
      if (node.type === "import_spec") {
        const pathNode = node.childForFieldName("path");
        if (pathNode) {
          const source = pathNode.text.replace(/['"]/g, "");
          metadata.imports.push({ source, symbols: [] });
        }
      }

      for (let i = 0; i < node.childCount; i++) traverse(node.child(i));
    }

    traverse(tree.rootNode);
    return { blocks, metadata };
  }
};