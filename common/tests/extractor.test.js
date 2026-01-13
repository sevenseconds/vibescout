import { describe, it, expect } from "vitest";
import { extractCodeBlocks } from "../src/extractor.js";
import path from "path";
import fs from "fs-extra";

describe("Code Extractor with Dependencies", () => {
  it("should extract code blocks, imports and exports", async () => {
    const testFile = path.join(process.cwd(), "temp_deps_test.ts");
    const content = `
import { userService } from "./services";
import { Config } from "../types";

export class AuthController {
  login() { return true; }
}

export function exportedFunc() {}
function internal() {}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { blocks, metadata } = await extractCodeBlocks(testFile);
      
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(metadata.imports.length).toBe(2);
      expect(metadata.imports[0].source).toBe("./services");
      expect(metadata.imports[0].symbols).toContain("userService");

      expect(metadata.exports).toContain("AuthController");
      expect(metadata.exports).toContain("exportedFunc");
      expect(metadata.exports).not.toContain("internal");
    } finally {
      await fs.remove(testFile);
    }
  });

  it("should chunk large functions into logical pieces", async () => {
    const testFile = path.join(process.cwd(), "large_file_test.ts");
    // Create a function longer than 50 lines
    const lines = new Array(60).fill("  console.log('padding');").join("\n");
    const content = `
      /**
       * Giant logic function
       */
      export function giantFunction() {
        if (true) {
          console.log("split point 1");
        }
        ${lines}
        try {
          console.log("split point 2");
        } catch(e) {}
      }
    `;
    await fs.writeFile(testFile, content);

    try {
      const { blocks } = await extractCodeBlocks(testFile);
      
      const chunks = blocks.filter(b => b.type === "chunk");
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].name).toContain("giantFunction (Chunk");
      expect(chunks[0].comments).toContain("Giant logic function"); // Context inheritance
    } finally {
      await fs.remove(testFile);
    }
  });
});
