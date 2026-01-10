import { describe, it, expect } from "vitest";
import { JavaStrategy } from "../src/extractors/JavaStrategy.js";

describe("Java Strategy", () => {
  it("should extract classes and methods from Java code", async () => {
    const code = `
      package com.example;
      import java.util.List;

      /**
       * A sample service
       */
      public class UserService {
          private List<String> users;

          public void addUser(String name) {
              users.add(name);
          }
      }
    `;

    const { blocks, metadata } = await JavaStrategy.extract(code, "test.java");

    const blockNames = blocks.map(b => b.name);
    expect(blockNames).toContain("UserService");
    expect(blockNames).toContain("addUser");

    const userService = blocks.find(b => b.name === "UserService");
    expect(userService.type).toBe("class");
    expect(userService.comments).toContain("A sample service");

    expect(metadata.imports.map(i => i.source)).toContain("java.util.List");
  });
});
