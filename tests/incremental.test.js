import { describe, it, expect, afterAll } from "vitest";
import { clearDatabase } from "../src/db.js";
import { handleIndexFolder } from "../src/index.js";
import path from "path";
import fs from "fs-extra";

describe("Incremental Indexing", () => {
  const testDir = path.join(process.cwd(), "temp_incremental_test");

  afterAll(async () => {
    await fs.remove(testDir);
    await clearDatabase();
  });

  it("should skip unchanged files on second indexing", async () => {
    await fs.ensureDir(testDir);
    const filePath = path.join(testDir, "test.ts");
    await fs.writeFile(filePath, "export function test() { return 1; }");

    // First index
    const res1 = await handleIndexFolder(testDir, "TestProject");
    expect(res1.content[0].text).toContain("Indexed: 1");

    // Second index (no changes)
    const res2 = await handleIndexFolder(testDir, "TestProject");
    expect(res2.content[0].text).toContain("Skipped: 1");

    // Modify file
    await fs.writeFile(filePath, "export function test() { return 2; }");
    const res3 = await handleIndexFolder(testDir, "TestProject");
    expect(res3.content[0].text).toContain("Indexed: 1");
  }, 60000);
});