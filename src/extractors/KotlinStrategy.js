import Parser from "tree-sitter";
import Kotlin from "tree-sitter-kotlin";

const parser = new Parser();
parser.setLanguage(Kotlin);

const CHUNK_LINE_THRESHOLD = 50;

export const KotlinStrategy = {
  extensions: [".kt", ".kts"],
  
  extract: async (code, filePath) => {
    const tree = parser.parse(code);
    const blocks = [];
    const metadata = { imports: [], exports: [] };

    function isComment(node) {
      return node && (node.type === "comment" || node.type === "line_comment" || node.type === "block_comment" || node.type === "multiline_comment");
    }

    function getComments(node) {
      const commentNodes = [];
      
      let prev = node.previousSibling;
      while (prev) {
        if (isComment(prev)) {
          commentNodes.unshift(prev.text);
        } else if (prev.text.trim().length > 0) {
          // If not a comment and not whitespace, check for trailing comments inside its sub-tree
          let last = prev;
          while (last && last.childCount > 0) {
            last = last.lastChild;
            if (isComment(last)) {
              commentNodes.unshift(last.text);
              break; 
            }
            if (last.childCount === 0 && last.text.trim().length > 0) break;
          }
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
        const nameNode = node.children.find(c => c.type === "type_identifier");
        if (nameNode) {
          name = nameNode.text;
          type = "class";
        }
      } else if (node.type === "function_declaration") {
        const nameNode = node.children.find(c => c.type === "simple_identifier");
        if (nameNode) {
          name = nameNode.text;
          // Check if it's a method
          let parent = node.parent;
          while (parent) {
            if (parent.type === "class_body") {
              type = "method";
              break;
            }
            parent = parent.parent;
          }
          if (!type) type = "function";
        }
      } else if (node.type === "property_declaration") {
        const nameNode = node.children.find(c => c.type === "variable_declaration")?.children.find(c => c.type === "simple_identifier");
        if (nameNode) {
          name = nameNode.text;
          type = "property";
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
          const bodyNode = node.children.find(c => c.type === "function_body" || c.type === "class_body");
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
              if (["if_expression", "for_statement", "when_expression"].includes(child.type) || currentLines >= 20) {
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
      if (node.type === "import_header") {
        const idNode = node.children.find(c => c.type === "identifier");
        if (idNode) {
          const isWildcard = node.children.some(c => c.type === "wildcard_import");
          const source = idNode.text + (isWildcard ? ".*" : "");
          const parts = idNode.text.split(".");
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
