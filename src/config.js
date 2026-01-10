import fs from "fs-extra";
import path from "path";
import os from "os";
import pkg from "enquirer";
const { Form } = pkg;

const CONFIG_DIR = path.join(os.homedir(), ".vibescout");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG = {
  modelsPath: "",
  embeddingModel: "Xenova/bge-small-en-v1.5",
  port: 3000,
  summarize: true,
  verbose: false
};

export async function loadConfig() {
  await fs.ensureDir(CONFIG_DIR);
  if (await fs.pathExists(CONFIG_FILE)) {
    try {
      const userConfig = await fs.readJson(CONFIG_FILE);
      return { ...DEFAULT_CONFIG, ...userConfig };
    } catch (err) {
      console.error(`Error reading config file: ${err.message}`);
    }
  }
  return { ...DEFAULT_CONFIG };
}

export async function saveConfig(config) {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
}

export async function interactiveConfig() {
  const currentConfig = await loadConfig();

  const prompt = new Form({
    name: "user",
    message: "VibeScout Configuration (Use arrows to move, type to edit):",
    choices: [
      { name: "modelsPath", message: "Models Path", initial: currentConfig.modelsPath },
      { name: "embeddingModel", message: "Embedding Model", initial: currentConfig.embeddingModel },
      { name: "port", message: "Server Port", initial: String(currentConfig.port) },
      { name: "summarize", message: "Summarize (true/false)", initial: String(currentConfig.summarize) },
      { name: "verbose", message: "Verbose Logs (true/false)", initial: String(currentConfig.verbose) }
    ]
  });

  try {
    const answers = await prompt.run();
    
    // Type conversion
    const newConfig = {
      ...answers,
      port: parseInt(answers.port) || 3000,
      summarize: answers.summarize === "true",
      verbose: answers.verbose === "true"
    };

    await saveConfig(newConfig);
    console.log(`\nConfig saved to ${CONFIG_FILE}`);
  } catch (err) {
    console.log("\nConfig update cancelled.");
  }
}
