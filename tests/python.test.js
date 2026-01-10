import { describe, it, expect } from "vitest";
import { PythonStrategy } from "../src/extractors/PythonStrategy.js";

describe("Python Strategy", () => {
  it("should extract classes and functions from Python code", async () => {
    const code = `
import os
from math import sqrt

class Calculator:
    """A simple calculator class"""
    def add(self, a, b):
        return a + b

def main():
    # Call the calculator
    calc = Calculator()
    print(calc.add(1, 2))
    `;

    const { blocks, metadata } = await PythonStrategy.extract(code, "test.py");

    const blockNames = blocks.map(b => b.name);
    expect(blockNames).toContain("Calculator");
    expect(blockNames).toContain("add");
    expect(blockNames).toContain("main");

    const calcClass = blocks.find(b => b.name === "Calculator");
    expect(calcClass.type).toBe("class");

    const addMethod = blocks.find(b => b.name === "add");
    expect(addMethod.type).toBe("method");

    expect(metadata.imports.map(i => i.source)).toContain("os");
    expect(metadata.imports.map(i => i.source)).toContain("math");
  });
});
