import { describe, it, expect } from "vitest";
import { JsonStrategy } from "../src/extractors/JsonStrategy.js";
import { TomlStrategy } from "../src/extractors/TomlStrategy.js";
import { XmlStrategy } from "../src/extractors/XmlStrategy.js";

describe("Data Format Strategies", () => {
  it("should extract keys from JSON", async () => {
    const code = JSON.stringify({
      name: "vibescout",
      version: "1.0.0",
      dependencies: { "tree-sitter": "0.21.1" }
    }, null, 2);

    const { blocks } = await JsonStrategy.extract(code, "package.json");
    const names = blocks.map(b => b.name);
    expect(names).toContain("name");
    expect(names).toContain("version");
  });

  it("should extract tables from TOML", async () => {
    const code = `
[package]
name = "vibescout"
version = "0.1.0"

[dependencies]
lancedb = "0.23.0"
    `;

    const { blocks } = await TomlStrategy.extract(code, "Cargo.toml");
    const names = blocks.map(b => b.name);
    expect(names).toContain("package");
    expect(names).toContain("dependencies");
  });

  it("should extract tags from XML/HTML", async () => {
    const code = `
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="VibeScout"
        android:icon="@mipmap/ic_launcher">
        <activity android:name=".MainActivity" />
    </application>
</manifest>
    `;

    const { blocks } = await XmlStrategy.extract(code, "AndroidManifest.xml");
    const names = blocks.map(b => b.name);
    expect(names).toContain("<manifest>");
    expect(names).toContain("<application>");
    expect(names).toContain("<activity>");
  });
});
