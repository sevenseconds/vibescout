import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import fs from "fs-extra";

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

/**
 * Extracts classes, methods, functions, imports, and exports from a file.
 */
export async function extractCodeBlocks(filePath) {
  const code = await fs.readFile(filePath, "utf-8");
  const tree = parser.parse(code);
  const blocks = [];
  const metadata = {
    imports: [],
    exports: []
  };

  function traverse(node) {
    // --- 1. Code Block Extraction (Same as before) ---
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
      const content = node.text;

      const commentNodes = [];
      let prev = node.previousNamedSibling;
      while (prev && prev.type === "comment") {
        commentNodes.unshift(prev.text);
        prev = prev.previousNamedSibling;
      }
      const comments = commentNodes.join("\n");

      blocks.push({
        name,
        type,
        startLine,
        endLine,
        comments,
        content,
        filePath
      });
    }

    // --- 2. Dependency Graph Extraction ---
    
    // Imports: import { a, b as c } from './module'
    if (node.type === "import_statement") {
      const sourceNode = node.childForFieldName("source");
      if (sourceNode) {
        const source = sourceNode.text.replace(/['"]/g, "");
        // Find all imported identifiers
        const identifiers = [];
        const traverseImports = (n) => {
          if (n.type === "import_specifier") {
            const name = n.childForFieldName("name")?.text;
            const alias = n.childForFieldName("alias")?.text;
            identifiers.push(alias || name);
          } else if (n.type === "namespace_import" || n.type === "identifier") {
            if (n.parent.type === "import_statement" || n.parent.type === "import_clause") {
              identifiers.push(n.text);
            }
          }
          for (let i = 0; i < n.childCount; i++) traverseImports(n.child(i));
        };
        traverseImports(node);
        metadata.imports.push({ source, symbols: identifiers });
      }
    }

    // Exports: export function foo() {}, export const x = 1, export { a, b }
    if (node.type === "export_statement") {
      const declaration = node.childForFieldName("declaration");
      if (declaration) {
        // export function/class...
        const nameNode = declaration.childForFieldName("name");
        if (nameNode) metadata.exports.push(nameNode.text);
      } else {
        // export { a, b }
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child.type === "export_clause") {
            for (let j = 0; j < child.childCount; j++) {
              const spec = child.child(j);
              if (spec.type === "export_specifier") {
                const name = spec.childForFieldName("name")?.text;
                const alias = spec.childForFieldName("alias")?.text;
                metadata.exports.push(alias || name);
              }
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
