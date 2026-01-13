import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { handleIndexFolder } from "../src/core.js";
import { clearDatabase, getProjectFiles } from "../src/db.js";
import path from "path";
import fs from "fs-extra";

describe("Ignore Functionality", () => {
  const testDir = path.join(process.cwd(), "temp_ignore_test");

  beforeEach(async () => {
    await clearDatabase();
    await fs.ensureDir(testDir);
  });

  afterAll(async () => {
    await fs.remove(testDir);
    await clearDatabase();
  });

  it("should respect .vibeignore patterns", async () => {
    // Create files
    await fs.writeFile(path.join(testDir, "included.ts"), "export const a = 1;");
    await fs.writeFile(path.join(testDir, "ignored.ts"), "export const b = 2;");
    
    // Create .vibeignore
    await fs.writeFile(path.join(testDir, ".vibeignore"), "ignored.ts");

    await handleIndexFolder(testDir, "IgnoreTest");

    const indexedFiles = await getProjectFiles();
    const fileNames = indexedFiles.map(f => path.basename(f));

    expect(fileNames).toContain("included.ts");
    expect(fileNames).not.toContain("ignored.ts");
  }, 30000);

  it("should respect .gitignore patterns", async () => {
    await fs.writeFile(path.join(testDir, "git_included.ts"), "export const a = 1;");
    await fs.writeFile(path.join(testDir, "git_ignored.ts"), "export const b = 2;");

    // Create .gitignore
    await fs.writeFile(path.join(testDir, ".gitignore"), "git_ignored.ts");

    await handleIndexFolder(testDir, "GitIgnoreTest");

    const indexedFiles = await getProjectFiles();
    const fileNames = indexedFiles.map(f => path.basename(f));

    expect(fileNames).toContain("git_included.ts");
    expect(fileNames).not.toContain("git_ignored.ts");
  }, 30000);

  it("should respect .vibescoutignore patterns", async () => {
    await fs.writeFile(path.join(testDir, "vibe_included.ts"), "export const a = 1;");
    await fs.writeFile(path.join(testDir, "vibe_ignored.ts"), "export const b = 2;");

    // Create .vibescoutignore
    await fs.writeFile(path.join(testDir, ".vibescoutignore"), "vibe_ignored.ts");

    await handleIndexFolder(testDir, "VibeScoutIgnoreTest");

    const indexedFiles = await getProjectFiles();
    const fileNames = indexedFiles.map(f => path.basename(f));

    expect(fileNames).toContain("vibe_included.ts");
    expect(fileNames).not.toContain("vibe_ignored.ts");
  }, 30000);

  it("should respect .cursorignore patterns", async () => {
    await fs.writeFile(path.join(testDir, "cursor_included.ts"), "export const a = 1;");
    await fs.writeFile(path.join(testDir, "cursor_ignored.ts"), "export const b = 2;");

    // Create .cursorignore (AI editor ignore file)
    await fs.writeFile(path.join(testDir, ".cursorignore"), "cursor_ignored.ts");

    await handleIndexFolder(testDir, "CursorIgnoreTest");

    const indexedFiles = await getProjectFiles();
    const fileNames = indexedFiles.map(f => path.basename(f));

    expect(fileNames).toContain("cursor_included.ts");
    expect(fileNames).not.toContain("cursor_ignored.ts");
  }, 30000);
});
