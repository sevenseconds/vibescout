import { describe, it, expect } from "vitest";
import { extractCodeBlocks } from "../src/extractor.js";
import path from "path";
import fs from "fs-extra";

describe("Extractor Resilience", () => {
  it("should extract valid blocks even with broken syntax nearby", async () => {
    const testFile = path.join(process.cwd(), "broken_test.ts");
    const content = `
      export class ValidClass {
        validMethod() {
          return "ok";
        }
      }

      function brokenFunction( {
        console.log("missing closing paren and brace"
      
      export function AnotherValidFunction() {
        return "still works";
      }
    `;
    await fs.writeFile(testFile, content);

    try {
      const { blocks } = await extractCodeBlocks(testFile);
      
      const classBlock = blocks.find(b => b.name === "ValidClass");
      const methodBlock = blocks.find(b => b.name === "validMethod");
      const validFunc = blocks.find(b => b.name === "AnotherValidFunction");

      expect(classBlock).toBeDefined();
      expect(methodBlock).toBeDefined();
      expect(validFunc).toBeDefined();
    } finally {
      await fs.remove(testFile);
    }
  });
});