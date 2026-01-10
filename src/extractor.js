import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import fs from "fs-extra";

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

const CHUNK_LINE_THRESHOLD = 50;

/**
 * Extracts classes, methods, functions, and logical chunks from large blocks.
 */
export async function extractCodeBlocks(filePath) {
  const code = await fs.readFile(filePath, "utf-8");
  const tree = parser.parse(code);
  const blocks = [];
  const metadata = {
    imports: [],
    exports: []
  };

  function getComments(node) {
    const commentNodes = [];
    // If the function is wrapped in an export statement, the comments are on the export statement
    const targetNode = node.parent?.type === "export_statement" ? node.parent : node;
    
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

    if (node.type === "class_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        name = nameNode.text;
        type = "class";
      }
    } else if (node.type === "method_definition") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        name = nameNode.text;
        type = "method";
      }
    } else if (node.type === "function_declaration" || node.type === "function_expression") {
      const nameNode = node.childForFieldName("name") || node.child(1);
      if (nameNode && (nameNode.type === "identifier" || nameNode.type === "type_identifier")) {
        name = nameNode.text;
        type = "function";
      }
    }

    if (name) {
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const lineCount = endLine - startLine;
      const comments = getComments(node);
      const content = node.text;

      // Add the main block
      blocks.push({
        name,
        type,
        startLine,
        endLine,
        comments,
        content,
        filePath
      });

      // --- Smart Chunking for Large Blocks ---
      if (lineCount > CHUNK_LINE_THRESHOLD) {
        const bodyNode = node.children.find(c => c.type === "statement_block" || c.type === "class_body");
        if (bodyNode) {
          let currentChunk = [];
          let currentChunkStart = -1;
          let chunkIndex = 1;

          for (let i = 0; i < bodyNode.childCount; i++) {
            const child = bodyNode.child(i);
            // Skip non-named nodes like braces
            if (!child.isNamed) continue;

            if (currentChunkStart === -1) currentChunkStart = child.startPosition.row + 1;
            currentChunk.push(child.text);

            const currentLines = (child.endPosition.row + 1) - currentChunkStart;

            // Split if child is a logical block or current chunk is getting large
            const isLogicalSplit = ["if_statement", "try_statement", "switch_statement", "for_statement", "while_statement"].includes(child.type);
            
            if (isLogicalSplit || currentLines >= 20) {
              blocks.push({
                name: `${name} (Chunk ${chunkIndex++})`,
                type: "chunk",
                startLine: currentChunkStart,
                endLine: child.endPosition.row + 1,
                comments: comments, // Inherit parent context
                content: currentChunk.join("\n"),
                filePath
              });
              currentChunk = [];
              currentChunkStart = -1;
            }
          }
          
          // Add remaining lines as a chunk
          if (currentChunk.length > 0) {
            blocks.push({
              name: `${name} (Chunk ${chunkIndex})`,
              type: "chunk",
              startLine: currentChunkStart,
              endLine: bodyNode.endPosition.row,
              comments: comments,
              content: currentChunk.join("\n"),
              filePath
            });
          }
        }
      }
    }

    // --- Dependency Extraction ---
    if (node.type === "import_statement") {
      const sourceNode = node.childForFieldName("source");
      if (sourceNode) {
        const source = sourceNode.text.replace(/['"]/g, "");
        const symbols = [];
        const extractSymbols = (n) => {
          if (n.type === "import_specifier") {
            symbols.push(n.childForFieldName("alias")?.text || n.childForFieldName("name")?.text);
          } else if (n.type === "namespace_import" || n.type === "identifier") {
            if (n.parent.type === "import_statement" || n.parent.type === "import_clause") symbols.push(n.text);
          }
          for (let i = 0; i < n.childCount; i++) extractSymbols(n.child(i));
        };
        extractSymbols(node);
        metadata.imports.push({ source, symbols });
      }
    }

    if (node.type === "export_statement") {
      const decl = node.childForFieldName("declaration");
      if (decl) {
        const nameNode = decl.childForFieldName("name");
        if (nameNode) metadata.exports.push(nameNode.text);
      } else {
        const clause = node.children.find(c => c.type === "export_clause");
        if (clause) {
          for (let i = 0; i < clause.childCount; i++) {
            const spec = clause.child(i);
            if (spec.type === "export_specifier") {
              metadata.exports.push(spec.childForFieldName("alias")?.text || spec.childForFieldName("name")?.text);
            }
          }
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      traverse(node.child(i));
    }
  }

  traverse(tree.rootNode);
  return { blocks, metadata };
}