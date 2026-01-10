import fs from "fs-extra";
import path from "path";
import os from "os";
import pkg from "enquirer";
const { Form, Select, Toggle } = pkg;
import { env } from "@huggingface/transformers";

const CONFIG_DIR = path.join(os.homedir(), ".vibescout");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const RECOMMENDED_MODELS = [
  { name: "Xenova/bge-small-en-v1.5", message: "BGE Small (Fast, Lightweight)" },
  { name: "Xenova/all-MiniLM-L6-v2", message: "MiniLM (Balanced)" },
  { name: "Xenova/bge-base-en-v1.5", message: "BGE Base (Higher Accuracy)" },
  { name: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", message: "Multilingual MiniLM" }
];

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

  try {
    // 1. Select Model
    const modelPrompt = new Select({
      name: "embeddingModel",
      message: "Select Embedding Model:",
      choices: RECOMMENDED_MODELS,
      initial: RECOMMENDED_MODELS.findIndex(m => m.name === currentConfig.embeddingModel) || 0
    });
    const embeddingModel = await modelPrompt.run();

    // 2. Basic settings via Form
    const formPrompt = new Form({
      name: "settings",
      message: "VibeScout Settings (Use arrows to move, type to edit):",
      choices: [
        { name: "modelsPath", message: "Models Path", initial: currentConfig.modelsPath, hint: `(Default: ${env.cacheDir})` },
        { name: "port", message: "Server Port", initial: String(currentConfig.port) }
      ]
    });
    const answers = await formPrompt.run();

    // 3. Feature Toggles
    const summarizePrompt = new Toggle({
      message: "Enable AI Summarization (Contextual Enrichment)?",
      enabled: "Yes",
      disabled: "No",
      initial: currentConfig.summarize
    });
    const summarize = await summarizePrompt.run();

    const verbosePrompt = new Toggle({
      message: "Enable Verbose Debug Logs?",
      enabled: "Yes",
      disabled: "No",
      initial: currentConfig.verbose
    });
    const verbose = await verbosePrompt.run();
    
    // Type conversion and merge
    const newConfig = {
      embeddingModel,
      modelsPath: answers.modelsPath,
      port: parseInt(answers.port) || 3000,
      summarize,
      verbose
    };

    await saveConfig(newConfig);
    console.log(`\nConfig saved to ${CONFIG_FILE}`);
    if (!newConfig.modelsPath) {
      console.log(`Models will be stored in default location: ${env.cacheDir}`);
    }
  } catch (err) {
    console.log("\nConfig update cancelled.");
  }
}
