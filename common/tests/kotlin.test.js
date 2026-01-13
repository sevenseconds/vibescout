import { describe, it, expect } from "vitest";
import { KotlinStrategy } from "../src/extractors/KotlinStrategy.js";

describe("Kotlin Strategy", () => {
  it("should extract classes and functions from Kotlin code", async () => {
    const code = `
      package com.example
      import kotlinx.coroutines.*

      /**
       * A data class
       */
      data class User(val id: String)

      fun main() {
          println("Hello")
      }

      class Service {
          fun doWork() {
              println("Working")
          }
      }
    `;

    const { blocks, metadata } = await KotlinStrategy.extract(code, "test.kt");

    const blockNames = blocks.map(b => b.name);
    expect(blockNames).toContain("User");
    expect(blockNames).toContain("main");
    expect(blockNames).toContain("Service");
    expect(blockNames).toContain("doWork");

    const userClass = blocks.find(b => b.name === "User");
    expect(userClass.type).toBe("class");
    expect(userClass.comments).toContain("A data class");

    const doWork = blocks.find(b => b.name === "doWork");
    expect(doWork.type).toBe("method");

    expect(metadata.imports.map(i => i.source)).toContain("kotlinx.coroutines.*");
  });
});
