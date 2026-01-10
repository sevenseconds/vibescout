import { describe, it, expect } from "vitest";
import { GoStrategy } from "../src/extractors/GoStrategy.js";

describe("Go Strategy", () => {
  it("should extract types, functions and methods from Go code", async () => {
    const code = `
package main

import (
	"fmt"
	"math"
)

// Calculator struct
type Calculator struct {
	Result float64
}

// Add two numbers
func (c *Calculator) Add(a, b float64) float64 {
	return a + b
}

func main() {
	fmt.Println("Hello Go")
}
    `;

    const { blocks, metadata } = await GoStrategy.extract(code, "test.go");

    const blockNames = blocks.map(b => b.name);
    expect(blockNames).toContain("Calculator");
    expect(blockNames).toContain("Add");
    expect(blockNames).toContain("main");

    const calcType = blocks.find(b => b.name === "Calculator");
    expect(calcType.type).toBe("type");
    expect(calcType.comments).toContain("Calculator struct");

    const addMethod = blocks.find(b => b.name === "Add");
    expect(addMethod.type).toBe("method");

    const sources = metadata.imports.map(i => i.source);
    expect(sources).toContain("fmt");
    expect(sources).toContain("math");
  });
});
