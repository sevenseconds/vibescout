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
  provider: "local",
  llmProvider: "local",
  dbProvider: "local",
  modelsPath: "",
  embeddingModel: "Xenova/bge-small-en-v1.5",
  llmModel: "Xenova/distilbart-cnn-6-6",
  ollamaUrl: "http://localhost:11434",
  openaiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  cloudflareAccountId: "",
  cloudflareToken: "",
  cloudflareVectorizeIndex: "",
  geminiKey: "",
  zaiKey: "",
  awsRegion: "us-east-1",
  awsProfile: "default",
  port: 3000,
  summarize: true,
  verbose: false,
  // Directories to watch (relative to project root)
  // Set to null or [] to watch the entire project root
  // Set to ["src", "lib", "components"] to watch only specific directories
  watchDirectories: ["src", "public", "app", "lib", "components"],

  // File type configuration for indexing and summarization
  fileTypes: {
    // Code files - summarize with code-focused prompts
    code: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".dart", ".java", ".kt", ".kts", ".rs", ".cpp", ".c", ".h"],
      summarize: true,
      promptTemplate: "summarize", // Uses summarizeTemplates[activeSummarizeId]
      description: "Source code files"
    },
    // Documentation files - summarize with doc-focused prompts
    docs: {
      extensions: [".md", ".mdx", ".txt", ".rst"],
      summarize: true,
      promptTemplate: "docSummarize",
      maxLength: 3000, // Truncate content before sending to AI
      description: "Documentation and text files"
    },
    // Config files - skip summarization (just embed)
    config: {
      extensions: [".json", ".yaml", ".yml", ".toml", ".ini", ".conf"],
      summarize: false,
      description: "Configuration files"
    },
    // Web files - summarize with code prompts
    web: {
      extensions: [".html", ".htm", ".css", ".scss", ".sass", ".less", ".svg", ".xml"],
      summarize: true,
      promptTemplate: "summarize",
      description: "Web files"
    },
    // Test files - skip summarization
    test: {
      extensions: [".test.js", ".test.ts", ".spec.js", ".spec.ts", ".test.tsx", ".spec.tsx"],
      summarize: false,
      description: "Test files"
    },
    // Lock files - skip entirely
    lock: {
      extensions: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "poetry.lock", "Cargo.lock"],
      index: false, // Don't even index these
      description: "Lock files"
    }
  },

  throttlingErrors: ["并发数过高", "1214", "1302", "1301", "429", "Rate limit", "too many requests"],
  prompts: {
    summarizeTemplates: [
      { id: 'default', name: 'Architect Summary', text: "Act as a Senior Software Architect. Analyze the following code and provide: 1. A high-level overview of the purpose. 2. Key logic flow. 3. Potential edge cases or security risks. \n\nFile: {{fileName}}\nProject: {{projectName}}\n\nHere is the code:\n{{code}}" },
      { id: 'detailed', name: 'Detailed Analysis', text: "Provide a detailed technical analysis of this code, focusing on its role in the system and potential edge cases.\n\nFile: {{fileName}}\nProject: {{projectName}}\n\nCode:\n{{code}}" }
    ],
    activeSummarizeId: 'default',
    chunkSummarize: "Summarize this specific logic block within a function. Focus on what this part specifically achieves.\n\nFile: {{fileName}}\nContext: {{parentName}}\n\nCode:\n{{code}}",
    // Specialized prompt for documentation/markdown files
    docSummarize: "Summarize this documentation section concisely in 1-2 sentences. Focus on: What topic does this cover? What are the key points or instructions?\n\nFile: {{fileName}}\nSection: {{sectionName}}\n\nContent:\n{{content}}",
    bestQuestion: "I have searched my codebase for \"{{query}}\". \nBased on the code snippets found below, what is the most insightful and technically accurate question I should ask a chat assistant to understand how this specific logic is implemented and how it relates to my query?\n\nProvide only the question text, no preamble.\n\nContext:\n{{context}}",
    // Chat response prompt for code assistant
    chatResponse: "You are an expert code assistant helping a developer understand their codebase. Use the provided code context and conversation history to answer questions accurately and concisely.\n\nConversation History:\n{{history}}\n\nRelevant Code Context:\n{{context}}\n\nUser Question: {{query}}\n\nProvide a helpful, technically accurate answer. If the context doesn't contain enough information, say so. Use code examples when helpful."
  }
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
    // 1. Select AI Provider
    const providerPrompt = new Select({
      name: "provider",
      message: "Select AI Provider (Embeddings/Summary):",
      choices: [
        { name: "local", message: "Local (Transformers.js - Built-in)" },
        { name: "ollama", message: "Ollama (Local API)" },
        { name: "lmstudio", message: "LM Studio (Local OpenAI-compatible)" },
        { name: "openai", message: "OpenAI (Cloud)" },
        { name: "gemini", message: "Google Gemini (Cloud)" },
        { name: "zai", message: "Z.AI (BigModel.cn)" },
        { name: "bedrock", message: "AWS Bedrock (Cloud)" },
        { name: "cloudflare", message: "Cloudflare Workers AI (Cloud)" }
      ],
      initial: ["local", "ollama", "lmstudio", "openai", "gemini", "zai", "bedrock", "cloudflare"].indexOf(currentConfig.provider)
    });
    const provider = await providerPrompt.run();

    let embeddingModel = currentConfig.embeddingModel;
    let ollamaUrl = currentConfig.ollamaUrl;
    let openaiKey = currentConfig.openaiKey;
    let openaiBaseUrl = currentConfig.openaiBaseUrl;
    let cloudflareAccountId = currentConfig.cloudflareAccountId;
    let cloudflareToken = currentConfig.cloudflareToken;
    let cloudflareVectorizeIndex = currentConfig.cloudflareVectorizeIndex;
    let geminiKey = currentConfig.geminiKey;
    let zaiKey = currentConfig.zaiKey;
    let awsRegion = currentConfig.awsRegion;
    let awsProfile = currentConfig.awsProfile;

    if (provider === "local") {
      const modelPrompt = new Select({
        name: "embeddingModel",
        message: "Select Local Embedding Model:",
        choices: RECOMMENDED_MODELS,
        initial: RECOMMENDED_MODELS.findIndex(m => m.name === currentConfig.embeddingModel) || 0
      });
      embeddingModel = await modelPrompt.run();
    } else if (provider === "ollama") {
      const ollamaForm = new Form({
        name: "ollama",
        message: "Ollama Configuration:",
        choices: [
          { name: "url", message: "Ollama URL", initial: currentConfig.ollamaUrl },
          { name: "model", message: "Ollama Model Name", initial: currentConfig.embeddingModel }
        ]
      });
      const answers = await ollamaForm.run();
      ollamaUrl = answers.url;
      embeddingModel = answers.model;
    } else if (provider === "lmstudio") {
      const lmForm = new Form({
        name: "lmstudio",
        message: "LM Studio Configuration:",
        choices: [
          { name: "url", message: "Base URL", initial: currentConfig.openaiBaseUrl || "http://localhost:1234/v1" },
          { name: "model", message: "Model Name", initial: currentConfig.embeddingModel }
        ]
      });
      const answers = await lmForm.run();
      openaiBaseUrl = answers.url;
      embeddingModel = answers.model;
      openaiKey = "not-needed";
    } else if (provider === "openai") {
      const openaiForm = new Form({
        name: "openai",
        message: "OpenAI Configuration:",
        choices: [
          { name: "key", message: "API Key", initial: currentConfig.openaiKey },
          { name: "baseUrl", message: "Base URL", initial: currentConfig.openaiBaseUrl },
          { name: "model", message: "Model Name", initial: currentConfig.embeddingModel }
        ]
      });
      const answers = await openaiForm.run();
      openaiKey = answers.key;
      openaiBaseUrl = answers.baseUrl;
      embeddingModel = answers.model;
    } else if (provider === "zai") {
      const zaiForm = new Form({
        name: "zai",
        message: "Z.AI Configuration:",
        choices: [
          { name: "key", message: "API Key", initial: currentConfig.zaiKey },
          { name: "model", message: "Model Name (e.g. glm-4)", initial: currentConfig.embeddingModel }
        ]
      });
      const answers = await zaiForm.run();
      zaiKey = answers.key;
      embeddingModel = answers.model;
    } else if (provider === "bedrock") {
      const bedrockForm = new Form({
        name: "bedrock",
        message: "AWS Bedrock Configuration:",
        choices: [
          { name: "region", message: "AWS Region", initial: currentConfig.awsRegion },
          { name: "profile", message: "AWS Profile", initial: currentConfig.awsProfile },
          { name: "model", message: "Model ID (e.g. anthropic.claude-3-sonnet-20240229-v1:0)", initial: currentConfig.embeddingModel }
        ]
      });
      const answers = await bedrockForm.run();
      awsRegion = answers.region;
      awsProfile = answers.profile;
      embeddingModel = answers.model;
    } else if (provider === "gemini") {
      const geminiForm = new Form({
        name: "gemini",
        message: "Google Gemini Configuration:",
        choices: [
          { name: "key", message: "API Key", initial: currentConfig.geminiKey },
          { name: "model", message: "Model Name", initial: currentConfig.embeddingModel || "text-embedding-004" }
        ]
      });
      const answers = await geminiForm.run();
      geminiKey = answers.key;
      embeddingModel = answers.model;
    } else if (provider === "cloudflare") {
      const cfForm = new Form({
        name: "cloudflare",
        message: "Cloudflare Workers AI Configuration:",
        choices: [
          { name: "accountId", message: "Account ID", initial: currentConfig.cloudflareAccountId },
          { name: "token", message: "API Token", initial: currentConfig.cloudflareToken },
          { name: "model", message: "Embedding Model", initial: currentConfig.embeddingModel || "@cf/baai/bge-small-en-v1.5" }
        ]
      });
      const answers = await cfForm.run();
      cloudflareAccountId = answers.accountId;
      cloudflareToken = answers.token;
      embeddingModel = answers.model;
    }

    // 2. Select DB Provider
    const dbProviderPrompt = new Select({
      name: "dbProvider",
      message: "Select Database Provider (Vectors):",
      choices: [
        { name: "local", message: "Local (LanceDB - Built-in)" },
        { name: "cloudflare", message: "Cloudflare Vectorize (Cloud)" }
      ],
      initial: ["local", "cloudflare"].indexOf(currentConfig.dbProvider)
    });
    const dbProvider = await dbProviderPrompt.run();

    if (dbProvider === "cloudflare") {
      const vectorizeForm = new Form({
        name: "vectorize",
        message: "Cloudflare Vectorize Configuration:",
        choices: [
          { name: "accountId", message: "Account ID", initial: cloudflareAccountId || currentConfig.cloudflareAccountId },
          { name: "token", message: "API Token", initial: cloudflareToken || currentConfig.cloudflareToken },
          { name: "indexName", message: "Index Name", initial: currentConfig.cloudflareVectorizeIndex }
        ]
      });
      const answers = await vectorizeForm.run();
      cloudflareAccountId = answers.accountId;
      cloudflareToken = answers.token;
      cloudflareVectorizeIndex = answers.indexName;
    }

    // 3. Basic settings via Form
    const formPrompt = new Form({
      name: "settings",
      message: "General Settings:",
      choices: [
        { name: "modelsPath", message: "Local Cache Path (Transformers.js only)", initial: currentConfig.modelsPath, hint: `(Default: ${env.cacheDir})` },
        { name: "port", message: "Server Port", initial: String(currentConfig.port) }
      ]
    });
    const answers = await formPrompt.run();

    // 4. Feature Toggles
    const summarizePrompt = new Toggle({
      message: "Enable AI Summarization?",
      initial: currentConfig.summarize
    });
    const summarize = await summarizePrompt.run();

    const verbosePrompt = new Toggle({
      message: "Enable Verbose Debug Logs?",
      initial: currentConfig.verbose
    });
    const verbose = await verbosePrompt.run();
    
    const newConfig = {
      provider,
      dbProvider,
      embeddingModel,
      ollamaUrl,
      openaiKey,
      openaiBaseUrl,
      cloudflareAccountId,
      cloudflareToken,
      cloudflareVectorizeIndex,
      geminiKey,
      zaiKey,
      awsRegion,
      awsProfile,
      modelsPath: answers.modelsPath,
      port: parseInt(answers.port) || 3000,
      summarize,
      verbose
    };

    await saveConfig(newConfig);
    console.log(`\nConfig saved to ${CONFIG_FILE}`);
  } catch {
    console.log("\nConfig update cancelled.");
  }
}
