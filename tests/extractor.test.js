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
});
