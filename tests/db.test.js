import { describe, it, expect, afterAll } from "vitest";
import { createOrUpdateTable, search, listKnowledgeBase, clearDatabase } from "../src/db.js";

describe("LanceDB Manager with Multi-Project Support", () => {
  afterAll(async () => {
    await clearDatabase();
  });

  it("should handle multi-project collections and filtering", async () => {
    const data1 = [
      {
        vector: new Array(384).fill(0.1),
        projectName: "Proj-A",
        collection: "Work",
        name: "func1",
        type: "function",
        filePath: "a.ts",
        startLine: 1,
        endLine: 5,
        comments: "",
        content: "const a = 1;"
      }
    ];

    const data2 = [
      {
        vector: new Array(384).fill(0.2),
        projectName: "Proj-B",
        collection: "Personal",
        name: "func2",
        type: "function",
        filePath: "b.ts",
        startLine: 1,
        endLine: 5,
        comments: "",
        content: "const b = 2;"
      }
    ];

    await createOrUpdateTable(data1, "test-model");
    await createOrUpdateTable(data2, "test-model");
    
    // Test Knowledge Base Listing
    const kb = await listKnowledgeBase();
    expect(kb["Work"]).toContain("Proj-A");
    expect(kb["Personal"]).toContain("Proj-B");

    // Test Global Search
    const all = await search(new Array(384).fill(0.1), { limit: 10 });
    expect(all.length).toBe(2);

    // Test Filtered Search
    const resultsWork = await search(new Array(384).fill(0.1), { collection: "Work" });
    expect(resultsWork.length).toBe(1);
    expect(resultsWork[0].projectName).toBe("Proj-A");

    const resultsPersonal = await search(new Array(384).fill(0.1), { collection: "Personal" });
    expect(resultsPersonal.length).toBe(1);
    expect(resultsPersonal[0].projectName).toBe("Proj-B");

    // Test specific project search
    const resultsProjA = await search(new Array(384).fill(0.1), { projectName: "Proj-A" });
    expect(resultsProjA[0].projectName).toBe("Proj-A");
  });
});