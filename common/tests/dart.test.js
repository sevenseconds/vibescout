import { describe, it, expect } from "vitest";
import { DartStrategy } from "../src/extractors/DartStrategy.js";

describe("Dart Strategy (Regex Fallback)", () => {
  it("should extract imports and classes from Dart code", async () => {
    const code = `
import 'package:flutter/material.dart';

/// A sample class
class MyApp extends StatelessWidget {
  void main() {
    print("Hello");
  }
}
    `;

    const { blocks, metadata } = await DartStrategy.extract(code, "test.dart");

    expect(metadata.imports[0].source).toBe("package:flutter/material.dart");
    expect(blocks.map(b => b.name)).toContain("MyApp");
    expect(blocks.map(b => b.name)).toContain("main");
    
    const myApp = blocks.find(b => b.name === "MyApp");
    expect(myApp.comments).toContain("A sample class");
  });
});
