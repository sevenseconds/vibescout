#!/usr/bin/env node
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Robustly find tsx binary
let tsxPath = resolve(__dirname, "../node_modules/.bin/tsx");

// Fallback for global installations or different hoisting structures
if (!fs.existsSync(tsxPath)) {
  try {
    // Try to find it via npm's own resolution or path
    tsxPath = "tsx"; 
  } catch (e) {
    // Keep the original path if everything fails
  }
}

const entryPath = resolve(__dirname, "../src/index.js");

const child = spawn(tsxPath, [entryPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === 'win32' // Use shell on windows for better compatibility with PATH resolution
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
