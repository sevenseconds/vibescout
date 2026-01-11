import Parser from "tree-sitter";
import Python from "tree-sitter-python";

const parser = new Parser();
parser.setLanguage(Python);

const CHUNK_LINE_THRESHOLD = 50;

export const PythonStrategy = {
  extensions: [".py"],
  
  extract: async (code, filePath) => {
    const tree = parser.parse(code);
    const blocks = [];
    const metadata = { imports: [], exports: [] };

    function getComments(node) {
      const commentNodes = [];
      let prev = node.previousSibling;
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

      if (node.type === "class_definition") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          type = "class";
        }
      } else if (node.type === "function_definition") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          name = nameNode.text;
          // Check if it's a method (inside a class)
          let parent = node.parent;
          while (parent) {
            if (parent.type === "class_definition") {
              type = "method";
              break;
            }
            parent = parent.parent;
          }
          if (!type) type = "function";
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
          const bodyNode = node.childForFieldName("body");
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
              if (["if_statement", "try_statement", "for_statement", "while_statement"].includes(child.type) || currentLines >= 20) {
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
      if (node.type === "import_statement") {
        const names = node.children.filter(c => c.type === "dotted_name").map(c => c.text);
        names.forEach(source => {
          metadata.imports.push({ source, symbols: [] });
        });
      }

      if (node.type === "import_from_statement") {
        const sourceNode = node.childForFieldName("module_name");
        if (sourceNode) {
          const source = sourceNode.text;
          const symbols = [];
          
          // Look for aliased_import or identifier children
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child.type === "aliased_import") {
              const nameNode = child.childForFieldName("name");
              const aliasNode = child.childForFieldName("alias");
              if (aliasNode) symbols.push(aliasNode.text);
              else if (nameNode) symbols.push(nameNode.text);
            } else if (child.type === "identifier") {
              // Check if it's part of the imported names (not the from part)
              if (child.previousSibling && (child.previousSibling.text === "import" || child.previousSibling.text === ",")) {
                symbols.push(child.text);
              }
            }
          }
          metadata.imports.push({ source, symbols });
        }
      }

      for (let i = 0; i < node.childCount; i++) traverse(node.child(i));
    }

    traverse(tree.rootNode);
    return { blocks, metadata };
  }
};
