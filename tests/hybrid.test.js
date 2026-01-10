import { describe, it, expect, afterAll } from "vitest";
import { clearDatabase } from "../src/db.js";
import { handleIndexFolder, handleSearchCode } from "../src/index.js";
import path from "path";
import fs from "fs-extra";

describe("Hybrid Search", () => {
  const testDir = path.join(process.cwd(), "temp_hybrid_test");

  afterAll(async () => {
    await fs.remove(testDir);
    await clearDatabase();
  });

  it("should find results via both conceptual and exact keyword search", async () => {
    await fs.ensureDir(testDir);
    const filePath = path.join(testDir, "test.ts");
    // Unique keyword: "ZYX_UNIQUE_KEYWORD"
    // Concept: "Authentication logic"
    await fs.writeFile(filePath, `
      /**
       * Handles user authentication logic
       */
      export function login() {
        const secret = "ZYX_UNIQUE_KEYWORD";
        return true;
      }
    `);

    await handleIndexFolder(testDir, "HybridProj");

    // Test exact keyword (FTS)
    const res1 = await handleSearchCode("ZYX_UNIQUE_KEYWORD");
    expect(res1.content[0].text).toContain("login");

    // Test conceptual (Vector)
    const res2 = await handleSearchCode("How to sign in users?");
    expect(res2.content[0].text).toContain("login");
  }, 60000);
});