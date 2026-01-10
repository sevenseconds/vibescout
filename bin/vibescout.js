#!/usr/bin/env node
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsxPath = resolve(__dirname, "../node_modules/.bin/tsx");
const entryPath = resolve(__dirname, "../src/index.js");

const child = spawn(tsxPath, [entryPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
