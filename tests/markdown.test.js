import { describe, it, expect } from "vitest";
import { extractCodeBlocks } from "../src/extractor.js";
import path from "path";
import fs from "fs-extra";

describe("Markdown Extractor", () => {
  it("should split markdown by headings into searchable blocks", async () => {
    const testFile = path.join(process.cwd(), "temp_test.md");
    const content = `
# Project Title
Welcome to the project.

## Installation
Run npm install.

## Usage
Import the library.
    `;
    await fs.writeFile(testFile, content);

    try {
      const { blocks } = await extractCodeBlocks(testFile);
      
      expect(blocks.length).toBeGreaterThanOrEqual(3);
      
      const installBlock = blocks.find(b => b.name === "Doc: Installation");
      const usageBlock = blocks.find(b => b.name === "Doc: Usage");

      expect(installBlock).toBeDefined();
      expect(installBlock.content).toContain("Run npm install");
      expect(installBlock.type).toBe("documentation");

      expect(usageBlock).toBeDefined();
      expect(usageBlock.content).toContain("Import the library");
    } finally {
      await fs.remove(testFile);
    }
  });
});
