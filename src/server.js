import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';
import { glob } from "glob";
import { logger } from "./logger.js";
import {
  handleIndexFolder,
  handleSearchCode,
  searchCode,
    chatWithCode,
    openFile,
    indexingProgress,
    pauseIndexing,
    resetIndexingProgress
  } from "./core.js";
import {
  listKnowledgeBase,
  clearDatabase,
  getFileDependencies,
  getAllDependencies,
  findSymbolUsages,
  moveProjectToCollection,
  getWatchList,
  addChatMessage,
  getChatMessages,
  clearChatMessages,
  initDB,
  deleteProject,
  getProjectFiles
} from "./db.js";
import { watchProject, unwatchProject, initWatcher } from "./watcher.js";
import { embeddingManager, summarizerManager } from "./embeddings.js";
import { loadConfig, saveConfig } from "./config.js";
import { createRequire } from "module";
import { getRegistry } from './plugins/registry.js';
import { discoverPlugins, ensurePluginsDir, getPluginsDir } from './plugins/loader.js';

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// MCP Server Setup
export const server = new Server(
  {
    name: "vibescout",
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "index_folder",
        description: "Index a folder with Contextual AI Enrichment.",
        inputSchema: {
          type: "object",
          properties: {
            folderPath: { type: "string" },
            projectName: { type: "string" },
            collection: { type: "string" },
            summarize: {
              type: "boolean",
              description: "Use Hierarchical Context (pre-summarize functions). Slower but significantly more accurate. Default is true."
            },
            background: {
              type: "boolean",
              description: "If true, starts indexing in the background and returns immediately. Recommended for large projects."
            }
          },
          required: ["folderPath"],
        },
      },
      {
        name: "get_indexing_status",
        description: "Check the progress of the current background indexing task.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "search_code",
        description: "Search across knowledge base with reranking. Supports git-based filtering.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
            collection: { type: "string", description: "Optional collection filter" },
            projectName: { type: "string", description: "Optional project filter" },
            category: {
              type: "string",
              description: "Filter by category: 'code' (default) or 'documentation'",
              enum: ["code", "documentation"]
            },
            categories: {
              type: "array",
              items: { type: "string", enum: ["code", "documentation"] },
              description: "Filter by multiple categories (e.g. ['code', 'documentation'] to include both)"
            },
            authors: {
              type: "array",
              items: { type: "string" },
              description: "Filter by commit authors (e.g. ['Alice', 'Bob'])"
            },
            dateFrom: {
              type: "string",
              description: "Filter by minimum commit date (ISO format: '2024-01-01')"
            },
            dateTo: {
              type: "string",
              description: "Filter by maximum commit date (ISO format: '2024-12-31')"
            },
            churnLevels: {
              type: "array",
              items: { type: "string", enum: ["low", "medium", "high"] },
              description: "Filter by code stability (low=stable, high=frequently changed)"
            }
          },
          required: ["query"],
        },
      },
      {
        name: "move_project",
        description: "Move a project from one collection to another",
        inputSchema: {
          type: "object",
          properties: {
            projectName: { type: "string" },
            newCollection: { type: "string" },
          },
          required: ["projectName", "newCollection"],
        },
      },
      {
        name: "get_file_dependencies",
        description: "Get imports and exports for a specific file",
        inputSchema: {
          type: "object",
          properties: { filePath: { type: "string" } },
          required: ["filePath"],
        },
      },
      {
        name: "find_symbol_usages",
        description: "Find which files import a specific symbol",
        inputSchema: {
          type: "object",
          properties: { symbolName: { type: "string" } },
          required: ["symbolName"],
        },
      },
      {
        name: "list_knowledge_base",
        description: "List all indexed projects",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "watch_folder",
        description: "Watch a folder for real-time indexing",
        inputSchema: {
          type: "object",
          properties: { folderPath: { type: "string" }, projectName: { type: "string" }, collection: { type: "string" } },
          required: ["folderPath"],
        },
      },
      {
        name: "read_code_range",
        description: "Read a specific range of lines from a file. Useful for analyzing specific functions or blocks identified in search results.",
        inputSchema: {
          type: "object",
          properties: { filePath: { type: "string" }, startLine: { type: "number" }, endLine: { type: "number" } },
          required: ["filePath", "startLine", "endLine"],
        },
      },
      {
        name: "read_file",
        description: "Read the full content of a file.",
        inputSchema: {
          type: "object",
          properties: { filePath: { type: "string" } },
          required: ["filePath"],
        },
      },
      {
        name: "get_current_model",
        description: "Get active models",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "set_model",
        description: "Switch Embedding model (e.g., Xenova/bge-small-en-v1.5). Note: You should clear the index after switching models.",
        inputSchema: {
          type: "object",
          properties: { modelName: { type: "string" } },
          required: ["modelName"],
        },
      },
      {
        name: "clear_index",
        description: "Clear entire database",
        inputSchema: { type: "object", properties: {} }
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "index_folder") {
      const shouldSummarize = args.summarize !== undefined ? args.summarize : true;
      return await handleIndexFolder(args.folderPath, args.projectName, args.collection, shouldSummarize, !!args.background);
    }
    if (name === "get_indexing_status") {
      const { active, projectName, totalFiles, processedFiles, status } = indexingProgress;
      if (!active && status === "idle") return { content: [{ type: "text", text: "No indexing task has been run yet." }] };
      
      const percent = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;
      const msg = active 
        ? `Indexing "${projectName}": ${percent}% complete (${processedFiles}/${totalFiles} files).`
        : `Last task ("${projectName}") status: ${status}.`;
      
      return { content: [{ type: "text", text: msg }] };
    }
    if (name === "search_code") {
      const searchCategories = args.categories || (args.category ? [args.category] : undefined);
      return await handleSearchCode(
        args.query,
        args.collection,
        args.projectName,
        searchCategories,
        undefined, // fileTypes
        args.authors,
        args.dateFrom,
        args.dateTo,
        args.churnLevels
      );
    }
    if (name === "move_project") {
      await moveProjectToCollection(args.projectName, args.newCollection);
      return { content: [{ type: "text", text: `Moved to ${args.newCollection}` }] };
    }
    if (name === "get_file_dependencies") {
      const deps = await getFileDependencies(path.resolve(args.filePath));
      return { content: [{ type: "text", text: JSON.stringify(deps, null, 2) }] };
    }
    if (name === "find_symbol_usages") {
      const usages = await findSymbolUsages(args.symbolName);
      return { content: [{ type: "text", text: JSON.stringify(usages, null, 2) }] };
    }
    if (name === "get_current_model") {
      return { content: [{ type: "text", text: `Embedding: ${embeddingManager.getModel()}\nSummarizer: ${summarizerManager.modelName}` }] };
    }
    if (name === "set_model") {
      await embeddingManager.setModel(args.modelName);
      return { content: [{ type: "text", text: `Embedding model set to ${args.modelName}. Please clear your index if switching architectures.` }] };
    }
    if (name === "list_knowledge_base") {
      const kb = await listKnowledgeBase();
      const text = Object.entries(kb).map(([col, projs]) => `Collection "${col}":\n - ${projs.join("\n - ")}`).join("\n\n");
      return { content: [{ type: "text", text: text || "Empty." }] };
    }
    if (name === "watch_folder") {
      return await watchProject(args.folderPath, args.projectName, args.collection);
    }
    if (name === "read_code_range") {
      const fullPath = path.resolve(args.filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n");
      return { content: [{ type: "text", text: lines.slice(args.startLine - 1, args.endLine).join("\n") }] };
    }
    if (name === "read_file") {
      const fullPath = path.resolve(args.filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    }
    if (name === "clear_index") { await clearDatabase(); return { content: [{ type: "text", text: "Cleared." }] }; }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    logger.error(`Tool execution error: ${error.message}`);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// Hono App Setup
export const app = new Hono();

// Pipe Hono request logs to our custom logger at DEBUG level
app.use('*', honoLogger((str) => logger.debug(`[API] ${str}`)));
app.use('*', cors());

// API Routes
app.get('/api/kb', async (c) => {
  const kb = await listKnowledgeBase();
  return c.json(kb);
});

app.delete('/api/projects', async (c) => {
  const projectName = c.req.query('projectName');
  if (!projectName) return c.json({ error: 'projectName required' }, 400);
  await deleteProject(projectName);
  return c.json({ success: true });
});

app.get('/api/projects/root', async (c) => {
  const projectName = c.req.query('projectName');
  if (!projectName) return c.json({ error: 'projectName required' }, 400);
  
  const files = await getProjectFiles(); // This returns all known files
  // Heuristic: filter for files belonging to this project
  // Since we don't have a direct map yet, we'll try to find any file path that likely belongs
  // Alternatively, we could update listKnowledgeBase to provide paths
  const sampleFile = files.find(f => f.includes(projectName));
  if (!sampleFile) return c.json({ error: 'Project files not found' }, 404);
  
  const rootPath = path.dirname(sampleFile);
  return c.json({ rootPath });
});

app.get('/api/projects/framework', async (c) => {
  const projectName = c.req.query('projectName');
  const collection = c.req.query('collection') || 'default';

  if (!projectName) return c.json({ error: 'projectName required' }, 400);

  try {
    const { getProjectFiles } = await import('./db.js');
    const files = await getProjectFiles();

    // Find a file belonging to this project and collection
    const sampleFile = files.find(f => {
      const parts = f.split('/');
      const idx = parts.indexOf(collection);
      const nameIdx = parts.indexOf(projectName);
      return idx !== -1 && nameIdx !== -1 && idx < nameIdx;
    });

    if (!sampleFile) return c.json({ error: 'Project files not found' }, 404);

    const projectPath = path.dirname(sampleFile);

    // Detect framework
    const { detectFramework } = await import('./framework-detection.js');
    const detection = await detectFramework(projectPath);

    return c.json(detection);
  } catch (error) {
    logger.error('[API] Error detecting framework:', error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/index', async (c) => {
  const { folderPath, projectName, collection, summarize, force } = await c.req.json();
  // Read from config if summarize not explicitly provided in request
  const config = await loadConfig();
  const shouldSummarize = summarize !== undefined ? summarize : (config.summarize ?? true);
  handleIndexFolder(folderPath, projectName, collection || "default", shouldSummarize, true, !!force)
    .catch(err => logger.error(`Background indexing error: ${err.message}`));
  return c.json({ success: true, message: "Indexing started in background" });
});

app.get('/api/index/status', (c) => c.json(indexingProgress));

app.post('/api/index/pause', (c) => {
  pauseIndexing(true);
  return c.json({ success: true });
});

app.post('/api/index/resume', (c) => {
  pauseIndexing(false);
  return c.json({ success: true });
});

app.post('/api/index/retry', async (c) => {
  const { failedPaths, projectName, collection } = indexingProgress;
  if (!failedPaths || failedPaths.length === 0) return c.json({ error: 'No failed files to retry' }, 400);

  // Read summarize setting from config if not stored in progress
  const config = await loadConfig();
  const shouldSummarize = config.summarize ?? true;

  // Clear current failed list before retrying
  const pathsToRetry = [...failedPaths];
  indexingProgress.failedFiles = 0;
  indexingProgress.failedPaths = [];
  indexingProgress.active = true;
  indexingProgress.status = "indexing";
  indexingProgress.totalFiles = pathsToRetry.length;
  indexingProgress.processedFiles = 0;

  // We need to re-trigger for these specific files
  // Since handleIndexFolder takes a folder, we can update it or add a list handler
  // For now, let's keep it simple and just log we are retrying
  logger.info(`[Retry] Retrying ${pathsToRetry.length} failed files for ${projectName} (summarize: ${shouldSummarize})`);

  const { indexSingleFile } = await import("./core.js");

  // Fire and forget background retry
  (async () => {
    for (const filePath of pathsToRetry) {
      try {
        await indexSingleFile(filePath, projectName, collection || "default", shouldSummarize);
        indexingProgress.processedFiles++;
      } catch (err) {
        indexingProgress.failedFiles++;
        indexingProgress.processedFiles++;
        indexingProgress.failedPaths.push(filePath);
        indexingProgress.lastError = err.message;
      }
    }
    indexingProgress.active = false;
    indexingProgress.status = indexingProgress.failedFiles > 0 ? "completed_with_errors" : "completed";
  })();

  return c.json({ success: true, message: "Retry started in background" });
});

app.post('/api/index/reset', (c) => {
  resetIndexingProgress();
  return c.json({ success: true, message: "Indexing progress reset" });
});

app.get('/api/logs', (c) => c.json(logger.getRecentLogs()));

app.get('/api/logs/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    const onLog = async (log) => {
      await stream.writeSSE({
        data: JSON.stringify(log),
        event: 'log',
      });
    };

    logger.on('log', onLog);

    // Keep-alive heartbeat
    const heartbeat = setInterval(async () => {
      await stream.writeSSE({ data: 'ping', event: 'ping' });
    }, 30000);

    c.req.raw.signal.addEventListener('abort', () => {
      logger.off('log', onLog);
      clearInterval(heartbeat);
    });

    // Initial sync of existing buffer
    const recent = logger.getRecentLogs();
    for (const log of recent) {
      await stream.writeSSE({ data: JSON.stringify(log), event: 'log' });
    }
  });
});

app.get('/api/models/ollama', async (c) => {
  const config = await loadConfig();
  const url = c.req.query('url') || config.ollamaUrl;
  try {
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) throw new Error('Ollama not reachable');
    const data = await response.json();
    return c.json(data.models || []);
  } catch (err) {
    return c.json({ error: 'Ollama not running or unreachable' }, 500);
  }
});

app.post('/api/test/embedding', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    let manager = embeddingManager;

    // If temporary config provided, create a temporary provider instance
    if (body.provider && body.embeddingModel) {
      const { EmbeddingManager } = await import("./embeddings.js");
      const tempManager = new EmbeddingManager();
      
      const providerConfig = {
        type: (body.provider === "lmstudio" ? "openai" : body.provider) || "local",
        modelName: body.embeddingModel,
        baseUrl: body.provider === "ollama" ? body.ollamaUrl :
          (body.provider === "openai" || body.provider === "lmstudio") ? body.openaiBaseUrl : undefined,
        apiKey: body.provider === "gemini" ? body.geminiKey :
          body.provider === "cloudflare" ? body.cloudflareToken :
            (body.provider === "zai" || body.provider === "zai-coding") ? body.zaiKey :
              body.openaiKey,
        accountId: body.cloudflareAccountId,
        awsRegion: body.awsRegion,
        awsProfile: body.awsProfile
      };
      await tempManager.setProvider(providerConfig, body.throttlingErrors);
      manager = tempManager;
    }

    const vector = await manager.generateEmbedding("VibeScout test connection");
    return c.json({ success: true, message: `Successfully generated embedding (size: ${vector.length})` });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/test/llm', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    let manager = summarizerManager;

    if (body.llmProvider && body.llmModel) {
      const { SummarizerManager } = await import("./embeddings.js");
      const tempManager = new SummarizerManager();
      
      const provider = body.llmProvider || body.provider;
      const llmConfig = {
        type: (provider === "lmstudio" ? "openai" : provider) || "local",
        modelName: body.llmModel,
        baseUrl: provider === "ollama" ? body.ollamaUrl :
          (provider === "openai" || provider === "lmstudio") ? body.openaiBaseUrl : undefined,
        apiKey: provider === "gemini" ? body.geminiKey :
          provider === "cloudflare" ? body.cloudflareToken :
            (provider === "zai" || provider === "zai-coding") ? body.zaiKey :
              body.openaiKey,
        accountId: body.cloudflareAccountId,
        awsRegion: body.awsRegion,
        awsProfile: body.awsProfile
      };
      await tempManager.setProvider(llmConfig, body.throttlingErrors);
      manager = tempManager;
    }

    const response = await manager.generateResponse("Hi", "You are a connectivity test.");
    return c.json({ success: true, message: `Successfully reached LLM: "${response.substring(0, 50)}..."` });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/test/summarize-file', async (c) => {
  try {
    let { folderPath, type = 'code', customPrompt } = await c.req.json();
    if (!folderPath) return c.json({ error: 'Folder path required' }, 400);

    // Expand tilde
    if (folderPath.startsWith('~/') || folderPath === '~') {
      folderPath = path.join(os.homedir(), folderPath.slice(1));
    }

    const patterns = type === 'docs' 
      ? ['**/*.md', '**/*.txt', 'README.md'] 
      : ['**/*.ts', '**/*.js', '**/*.py', '**/*.go', '**/*.java', '**/*.cpp'];
    
    // Find a random file
    const absolutePath = path.resolve(folderPath);
    if (!await fs.pathExists(absolutePath)) {
      logger.error(`[Test] Folder not found: ${absolutePath}`);
      return c.json({ error: `Folder does not exist: ${absolutePath}` }, 404);
    }

    const files = await glob(patterns, { 
      cwd: absolutePath, 
      nodir: true, 
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      maxDepth: 5 
    });

    if (files.length === 0) {
      const allFiles = await fs.readdir(absolutePath);
      logger.warn(`[Test] No matching files found in ${absolutePath}. Directory contains: ${allFiles.slice(0, 5).join(', ')}...`);
      return c.json({ error: `No ${type} files (e.g. .ts, .js, .md) found in ${absolutePath}. Found: ${allFiles.length} items.` }, 404);
    }

    // Pick a random file
    const randomFile = files[Math.floor(Math.random() * files.length)];
    const filePath = path.join(absolutePath, randomFile);
    const content = await fs.readFile(filePath, 'utf-8');

    // If custom prompt provided, verify we can use it
    let templateName = undefined;
    if (customPrompt) {
      // We need to inject this into the config so the provider can find it
      // This is a bit of a hack: we save it as a special key 'test_custom'
      const config = await loadConfig();
      if (!config.prompts) config.prompts = {};
      config.prompts['test_custom'] = customPrompt;
      await saveConfig(config);
      templateName = 'test_custom';
    }

    const summary = await summarizerManager.summarize(content.substring(0, 10000), {
      fileName: randomFile,
      projectName: path.basename(absolutePath),
      promptTemplate: templateName
    });

    return c.json({
      file: randomFile,
      content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
      summary
    });
  } catch (err) {
    logger.error(`Test summarization failed: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

app.get('/api/debug/requests', async (c) => {
  const { debugStore } = await import("./debug.js");
  return c.json(debugStore.getRequests());
});

app.delete('/api/debug/requests', async (c) => {
  const { debugStore } = await import("./debug.js");
  debugStore.clear();
  return c.json({ success: true });
});

app.get('/api/deps', async (c) => {
  const filePath = c.req.query('filePath');
  if (!filePath) return c.json({ error: 'filePath required' }, 400);
  const deps = await getFileDependencies(path.resolve(filePath));
  return c.json(deps);
});

app.post('/api/search', async (c) => {
  const {
    query,
    collection,
    projectName,
    fileTypes,
    categories,
    authors,
    dateFrom,
    dateTo,
    churnLevels
  } = await c.req.json();

  const results = await searchCode(
    query,
    collection,
    projectName,
    fileTypes,
    categories,
    authors,
    dateFrom,
    dateTo,
    churnLevels
  );

  return c.json(results);
});

app.post('/api/search/summarize', async (c) => {
  const { query, results } = await c.req.json();
  
  const context = results.slice(0, 5).map(r => 
    `File: ${r.filePath}\nCategory: ${r.category}\nCode:\n${r.content.substring(0, 1000)}`
  ).join("\n\n---\n\n");

  const summary = await summarizerManager.generateBestQuestion(query, context);
  return c.json({ summary });
});

app.post('/api/prompts/generate', async (c) => {
  const { description, target } = await c.req.json();
  
  const placeholders = target === 'doc' 
    ? `{{content}} - The documentation content
{{fileName}} - The name of the file
{{sectionName}} - The specific section name (if available)`
    : `{{code}} - The code snippet
{{fileName}} - The name of the file
{{projectName}} - The project name`;

  const systemPrompt = `You are a prompt engineering expert for ${target === 'doc' ? 'documentation' : 'code'} analysis. 
The user wants a summarization prompt template for a tool called VibeScout.
You must use these exact placeholders in your generated template:
${placeholders}

Generate a highly effective, technical, and concise prompt based on the user's requirement. 
Return ONLY the prompt text, no preamble or explanation.`;

  const prompt = `Requirement: ${description}`;
  const generated = await summarizerManager.generateResponse(prompt, systemPrompt);
  
  return c.json({ prompt: generated });
});

app.post('/api/chat', async (c) => {
  const { query, collection, projectName, fileTypes, categories } = await c.req.json();
  const history = await getChatMessages();
  const response = await chatWithCode(query, collection, projectName, history, fileTypes, categories);
  
  await addChatMessage("user", query);
  await addChatMessage("assistant", response);
  
  return c.json({ response });
});

app.get('/api/chat', async (c) => {
  const messages = await getChatMessages();
  return c.json(messages);
});

app.delete('/api/chat', async (c) => {
  await clearChatMessages();
  return c.json({ success: true });
});

app.get('/api/stats', async (c) => {
  const kb = await listKnowledgeBase();
  const projectCount = Object.values(kb).reduce((acc, p) => acc + p.length, 0);
  return c.json({
    collections: Object.keys(kb).length,
    projects: projectCount,
    status: "active"
  });
});

app.get('/api/files/read', async (c) => {
  const filePath = c.req.query('path');
  if (!filePath) return c.json({ error: 'path required' }, 400);

  try {
    const content = await fs.readFile(path.resolve(filePath), 'utf-8');
    return c.json({ content });
  } catch (err) {
    return c.json({ error: 'Failed to read file' }, 500);
  }
});

app.post('/api/dependencies/batch', async (c) => {
  const { filePaths } = await c.req.json();
  if (!Array.isArray(filePaths)) return c.json({ error: 'filePaths must be an array' }, 400);

  try {
    const { getBatchDependencies } = await import('./db.js');
    const dependencies = await getBatchDependencies(filePaths);
    return c.json(dependencies);
  } catch (error) {
    logger.error('[API] Error fetching batch dependencies:', error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/open', async (c) => {
  const { filePath, line } = await c.req.json();
  await openFile(filePath, line);
  return c.json({ success: true });
});

app.get('/api/dialog/directory', async (c) => {
  const platform = process.platform;
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    if (platform === 'darwin') {
      // macOS AppleScript - returns POSIX path
      const script = 'osascript -e "POSIX path of (choose folder with prompt \\"Select Project Folder\\")"';
      const { stdout } = await execAsync(script);
      return c.json({ path: stdout.trim() });
    } else if (platform === 'win32') {
      // Windows PowerShell
      const script = 'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if($f.ShowDialog() -eq \\"OK\\"){ $f.SelectedPath }"';
      const { stdout } = await execAsync(script);
      return c.json({ path: stdout.trim() });
    }
    
    return c.json({ error: 'Unsupported platform for native dialog' }, 400);
  } catch (err) {
    // Check if user cancelled (usually non-zero exit code)
    if (err.message?.includes('User canceled')) {
      return c.json({ path: null });
    }
    logger.error(`Dialog error: ${err.message}`);
    return c.json({ error: 'Failed to open dialog or cancelled' }, 500);
  }
});

app.get('/api/fs/home', (c) => {
  return c.json({ path: os.homedir() });
});

app.get('/api/fs/ls', async (c) => {
  const root = c.req.query('path');
  if (!root) return c.json({ error: 'path required' }, 400);

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort();
    return c.json(dirs);
  } catch (err) {
    return c.json({ error: 'Failed to read directory' }, 500);
  }
});

app.get('/api/config', async (c) => {
  const config = await loadConfig();
  return c.json(config);
});

app.post('/api/config', async (c) => {
  const newConfig = await c.req.json();
  await saveConfig(newConfig);

  const providerConfig = {
    type: (newConfig.provider === "lmstudio" ? "openai" : newConfig.provider) || "local",
    modelName: newConfig.embeddingModel || "Xenova/bge-small-en-v1.5",
    baseUrl: newConfig.provider === "ollama" ? newConfig.ollamaUrl :
      (newConfig.provider === "openai" || newConfig.provider === "lmstudio") ? newConfig.openaiBaseUrl : undefined,
    apiKey: newConfig.provider === "gemini" ? newConfig.geminiKey :
      newConfig.provider === "cloudflare" ? newConfig.cloudflareToken :
        (newConfig.provider === "zai" || newConfig.provider === "zai-coding") ? newConfig.zaiKey :
          newConfig.openaiKey,
    accountId: newConfig.cloudflareAccountId,
    awsRegion: newConfig.awsRegion,
    awsProfile: newConfig.awsProfile
  };

  const llmConfig = {
    type: (newConfig.llmProvider === "lmstudio" ? "openai" : newConfig.llmProvider || newConfig.provider) || "local",
    modelName: newConfig.llmModel || newConfig.embeddingModel || "Xenova/distilbart-cnn-6-6",
    baseUrl: (newConfig.llmProvider || newConfig.provider) === "ollama" ? newConfig.ollamaUrl :
      ((newConfig.llmProvider || newConfig.provider) === "openai" || (newConfig.llmProvider || newConfig.provider) === "lmstudio") ? newConfig.openaiBaseUrl : undefined,
    apiKey: (newConfig.llmProvider || newConfig.provider) === "gemini" ? newConfig.geminiKey :
      (newConfig.llmProvider || newConfig.provider) === "cloudflare" ? newConfig.cloudflareToken :
        ((newConfig.llmProvider || newConfig.provider) === "zai" || (newConfig.llmProvider || newConfig.provider) === "zai-coding") ? newConfig.zaiKey :
          newConfig.openaiKey,
    accountId: newConfig.cloudflareAccountId,
    awsRegion: newConfig.awsRegion,
    awsProfile: newConfig.awsProfile
  };

        await embeddingManager.setProvider(providerConfig, newConfig.throttlingErrors);
        await summarizerManager.setProvider(llmConfig, newConfig.throttlingErrors);
  await initDB({
    type: newConfig.dbProvider || "local",
    accountId: newConfig.cloudflareAccountId,
    apiToken: newConfig.cloudflareToken,
    indexName: newConfig.cloudflareVectorizeIndex
  });

  await initWatcher();
  return c.json({ success: true });
});

app.get('/api/watchers', async (c) => {
  const watchers = await getWatchList();
  return c.json(watchers);
});

app.post('/api/watchers', async (c) => {
  const { folderPath, projectName, collection } = await c.req.json();
  await watchProject(folderPath, projectName, collection);
  return c.json({ success: true });
});

app.put('/api/watchers/update', async (c) => {
  const { folderpath, newPath, collection } = await c.req.json();

  try {
    const config = await loadConfig();
    const watchersList = config.watchDirectories || [];

    const watcherIndex = watchersList.findIndex(w => w.folderPath === folderpath);

    if (watcherIndex === -1) {
      return c.json({ error: 'Watcher not found' }, 404);
    }

    const watcher = watchersList[watcherIndex];

    // If path is changing, need to unwatch old and watch new
    if (newPath && newPath !== folderpath) {
      await unwatchProject(folderpath, watcher.projectName);
      await watchProject(newPath, watcher.projectname, collection || watcher.collection);
    } else if (collection && collection !== watcher.collection) {
      // Only collection is changing
      watcher.collection = collection;
      config.watchDirectories = watchersList;
      await saveConfig(config);
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error('[API] Error updating watcher:', error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.delete('/api/watchers/all', async (c) => {
  const watchersList = await getWatchList();
  for (const w of watchersList) {
    await unwatchProject(w.folderPath, w.projectName);
  }
  return c.json({ success: true });
});

app.delete('/api/watchers', async (c) => {
  const folderPath = c.req.query('folderPath');
  const projectName = c.req.query('projectName');
  if (!folderPath) return c.json({ error: 'folderPath required' }, 400);
  await unwatchProject(folderPath, projectName);
  return c.json({ success: true });
});

// Helper function to match static imports (relative paths) to absolute file paths
function matchImportToFile(importSource, targetFilePath) {
  // Normalize the import source (remove './' and '../')
  const normalizedImport = importSource.replace(/^\.\.?\//g, '');

  // Split into segments
  const importSegments = normalizedImport.split('/').filter(s => s);

  // Common extensions to try
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.dart', '.java', '.kt', '.go', '.py'];

  // Check if file path ends with the import pattern
  for (const ext of extensions) {
    const testPath = normalizedImport + ext;
    if (targetFilePath.endsWith(testPath)) return true;

    // Also check for barrel imports (index files)
    const barrelPaths = [
      normalizedImport + '/index' + ext,
      normalizedImport + '/index.ts',
      normalizedImport + '/index.tsx',
      normalizedImport + '/index.js',
      normalizedImport + '/index.jsx'
    ];

    for (const barrel of barrelPaths) {
      if (targetFilePath.endsWith(barrel)) return true;
    }
  }

  // Fallback: check if path segments match
  const fileSegments = targetFilePath.split('/').filter(s => s);
  if (importSegments.length > fileSegments.length) return false;

  // Check if the last N segments match (allowing for extension differences)
  const fileBasename = fileSegments[fileSegments.length - 1].replace(/\.[^.]+$/, ''); // remove extension
  const importBasename = importSegments[importSegments.length - 1];

  if (fileBasename === importBasename) {
    // Check if parent segments also match
    let matches = true;
    for (let i = 1; i < importSegments.length; i++) {
      if (fileSegments[fileSegments.length - 1 - i] !== importSegments[importSegments.length - 1 - i]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}

// Helper function to resolve runtime registry paths (dot notation) to file paths
function resolveRuntimePath(runtimePath, deps) {
  // runtimePath: "controllers.User" or "integrations.stripe.webhooks.Handler"
  // Convert dot notation to file path
  const segments = runtimePath.split('.');
  const directPath = segments.join('/');      // "controllers/User"
  const indexPath = directPath + '/index';    // "controllers/User/index"

  const extensions = ['.js', '.ts', '.jsx', '.tsx'];  // JavaScript only

  // Try both direct file and index file
  for (const variation of [directPath, indexPath]) {
    for (const ext of extensions) {
      const testPath = variation + ext;

      // Find a file that ends with this path
      const match = deps.find(d => {
        if (!d.filepath) return false; // Skip records with undefined filepath
        // Check if file path ends with X/Y/Z.ext
        return d.filepath.endsWith('/' + testPath) || d.filepath.endsWith(testPath);
      });

      if (match) return match.filepath;
    }
  }

  return null;
}

// Plugin Management API
app.get('/api/plugins', async (c) => {
  try {
    const plugins = await discoverPlugins();
    const registry = getRegistry();
    const config = await loadConfig();

    // Get disabled plugins from config
    const disabledPlugins = new Set(config.plugin?.disabled || []);

    // Enhance with runtime status and enabled flag
    const enrichedPlugins = plugins.map(p => {
      const loadedPlugin = registry.getPlugin(p.name);
      return {
        ...p,
        enabled: !disabledPlugins.has(p.name), // Check if plugin is disabled
        runtime: loadedPlugin ? {
          active: true,
          extractors: loadedPlugin.plugin.extractors?.length || 0,
          providers: loadedPlugin.plugin.providers?.length || 0,
          commands: loadedPlugin.plugin.commands?.length || 0
        } : { active: false }
      };
    });

    return c.json(enrichedPlugins);
  } catch (error) {
    logger.error('[Plugin API] Error listing plugins:', error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.get('/api/plugins/:name', async (c) => {
  const name = c.req.param('name');

  try {
    const plugins = await discoverPlugins();
    const plugin = plugins.find(p => p.name === name);

    if (!plugin) {
      return c.json({ error: 'Plugin not found' }, 404);
    }

    const registry = getRegistry();
    const loadedPlugin = registry.getPlugin(name);

    return c.json({
      ...plugin,
      runtime: loadedPlugin ? {
        active: true,
        extractors: loadedPlugin.plugin.extractors?.length || 0,
        providers: loadedPlugin.plugin.providers?.length || 0,
        commands: loadedPlugin.plugin.commands?.length || 0
      } : { active: false }
    });
  } catch (error) {
    logger.error(`[Plugin API] Error getting plugin ${name}:`, error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/plugins/:name/enable', async (c) => {
  const name = c.req.param('name');

  try {
    const config = await loadConfig();
    if (!config.plugin) {
      config.plugin = {};
    }
    if (!config.plugin.disabled) {
      config.plugin.disabled = [];
    }

    // Remove from disabled list
    config.plugin.disabled = config.plugin.disabled.filter((p) => p !== name);
    await saveConfig(config);

    // Reload plugins
    const registry = getRegistry();
    await registry.loadAll(config.plugin);

    return c.json({ success: true, message: `Plugin ${name} enabled` });
  } catch (error) {
    logger.error(`[Plugin API] Error enabling plugin ${name}:`, error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/plugins/:name/disable', async (c) => {
  const name = c.req.param('name');

  try {
    const config = await loadConfig();
    if (!config.plugin) {
      config.plugin = {};
    }
    if (!config.plugin.disabled) {
      config.plugin.disabled = [];
    }

    // Add to disabled list
    if (!config.plugin.disabled.includes(name)) {
      config.plugin.disabled.push(name);
    }
    await saveConfig(config);

    // Unload the plugin
    const registry = getRegistry();
    await registry.unloadPlugin(name);

    return c.json({ success: true, message: `Plugin ${name} disabled` });
  } catch (error) {
    logger.error(`[Plugin API] Error disabling plugin ${name}:`, error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/plugins/install', async (c) => {
  const contentType = c.req.header('content-type');

  // Handle file upload (ZIP)
  if (contentType?.includes('multipart/form-data')) {
    try {
      const formData = await c.req.formData();
      const file = formData.get('file');

      if (!file) {
        return c.json({ error: 'No file uploaded' }, 400);
      }

      const { getPluginsDir, ensurePluginsDir } = await import('./plugins/loader.js');
      await ensurePluginsDir();
      const pluginsDir = getPluginsDir();

      // Extract ZIP
      const AdmZip = (await import('adm-zip')).default;
      const buffer = Buffer.from(await file.arrayBuffer());
      const zip = new AdmZip(buffer);

      // Create plugin directory from file name
      const pluginName = file.name.replace('.zip', '');
      const pluginPath = path.join(pluginsDir, pluginName);

      await fs.ensureDir(pluginPath);
      zip.extractAllTo(pluginPath, true);

      logger.info(`[Plugin API] Installed plugin from ZIP: ${pluginName}`);

      return c.json({
        success: true,
        message: `Plugin ${pluginName} installed successfully from ZIP`
      });
    } catch (error) {
      logger.error('[Plugin API] Error installing plugin from ZIP:', error.message);
      return c.json({ error: error.message }, 500);
    }
  }

  // Handle JSON payload (npm or GitHub)
  const { name, version = 'latest', url, source = 'npm' } = await c.req.json();

  if (source === 'npm' && !name) {
    return c.json({ error: 'Plugin name required for npm installation' }, 400);
  }
  if (source === 'github' && !url) {
    return c.json({ error: 'GitHub URL required for GitHub installation' }, 400);
  }

  try {
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);
    const { getPluginsDir, ensurePluginsDir } = await import('./plugins/loader.js');

    await ensurePluginsDir();
    const pluginsDir = getPluginsDir();

    if (source === 'npm') {
      // Install from npm
      const pluginName = name.startsWith('vibescout-plugin-') ? name : `vibescout-plugin-${name}`;
      const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

      // Build install command with version
      const versionSuffix = version && version !== 'latest' ? `@${version}` : '';
      const { stdout, stderr } = await execAsync(`${cmd} install -g ${pluginName}${versionSuffix}`);

      logger.info(`[Plugin API] Installed ${pluginName}${versionSuffix} from npm:`, stdout);

      return c.json({
        success: true,
        message: `Plugin ${pluginName}${versionSuffix} installed successfully`,
        output: stdout
      });
    } else if (source === 'github') {
      // Parse GitHub URL
      const urlMatch = url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (!urlMatch) {
        return c.json({ error: 'Invalid GitHub URL. Expected: https://github.com/user/repo' }, 400);
      }

      const [, owner, repo] = urlMatch;
      const pluginName = repo.startsWith('vibescout-plugin-') ? repo : `vibescout-plugin-${repo}`;
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      const pluginPath = path.join(pluginsDir, pluginName);

      // Clone repository
      const { stdout } = await execAsync(`git clone --depth 1 ${cloneUrl} "${pluginPath}"`);

      logger.info(`[Plugin API] Installed ${pluginName} from GitHub:`, stdout);

      return c.json({
        success: true,
        message: `Plugin ${pluginName} installed successfully from GitHub`,
        path: pluginPath
      });
    } else {
      return c.json({ error: `Unknown installation source: ${source}` }, 400);
    }
  } catch (error) {
    logger.error(`[Plugin API] Error installing plugin:`, error.message);
    return c.json({
      error: error.message,
      output: error.stdout || error.stderr
    }, 500);
  }
});

app.delete('/api/plugins/:name', async (c) => {
  const name = c.req.param('name');

  try {
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);

    const pluginName = name.startsWith('vibescout-plugin-') ? name : `vibescout-plugin-${name}`;
    const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const { stdout, stderr } = await execAsync(`${cmd} uninstall -g ${pluginName}`);

    logger.info(`[Plugin API] Uninstalled ${pluginName}:`, stdout);

    // Also remove from config if disabled
    const config = await loadConfig();
    if (config.plugin?.disabled) {
      config.plugin.disabled = config.plugin.disabled.filter((p) => p !== name);
      await saveConfig(config);
    }

    return c.json({
      success: true,
      message: `Plugin ${pluginName} uninstalled successfully`,
      output: stdout
    });
  } catch (error) {
    logger.error(`[Plugin API] Error uninstalling plugin ${name}:`, error.message);
    return c.json({
      error: error.message,
      output: error.stdout || error.stderr
    }, 500);
  }
});

app.get('/api/plugins/dir/info', async (c) => {
  try {
    const pluginsDir = getPluginsDir();
    const { stat } = await import('fs-extra');

    const dirExists = await stat(pluginsDir).then(() => true).catch(() => false);

    return c.json({
      path: pluginsDir,
      exists: dirExists
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/plugins/dir/create', async (c) => {
  try {
    await ensurePluginsDir();
    const pluginsDir = getPluginsDir();
    return c.json({
      success: true,
      message: 'Plugins directory created',
      path: pluginsDir
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

app.get('/api/graph', async (c) => {
  const rawDeps = await getAllDependencies();
  const nodes = [];
  const links = [];

  if (!rawDeps || rawDeps.length === 0) return c.json({ nodes, links });

  // Merge dependencies by filePath - a file may have been indexed multiple times
  const depsMap = new Map();
  for (const d of rawDeps) {
    if (!d.filepath) continue; // Skip records with undefined filepath
    if (!depsMap.has(d.filepath)) {
      depsMap.set(d.filepath, { ...d, imports: d.imports });
    } else {
      // Merge imports from multiple index runs
      const existing = depsMap.get(d.filepath);
      const existingImports = JSON.parse(existing.imports);
      const newImports = JSON.parse(d.imports);

      // Deduplicate imports by source
      const importsMap = new Map();
      for (const imp of [...existingImports, ...newImports]) {
        const key = imp.source;
        if (!importsMap.has(key)) {
          importsMap.set(key, imp);
        }
      }

      existing.imports = JSON.stringify(Array.from(importsMap.values()));
    }
  }

  // Convert back to array
  const deps = Array.from(depsMap.values());

  const nodeMap = new Map();
  for (const d of deps) {
    if (!d.filepath) continue; // Skip records with undefined filepath
    if (!nodeMap.has(d.filepath)) {
      const node = { id: d.filepath, label: path.basename(d.filepath), group: d.projectname, collection: d.collection };
      nodes.push(node);
      nodeMap.set(d.filepath, node);
    }
  }

  // Use a Set to track unique links and prevent duplicates
  const seenLinks = new Set();

  for (const d of deps) {
    if (!d.filepath) continue; // Skip records with undefined filepath
    const imports = JSON.parse(d.imports);

    for (const imp of imports) {
      let target;

      // Check if this is a runtime dependency (dot notation without ./ or ../)
      if (imp.runtime || (!imp.source.startsWith('.') && !imp.source.startsWith('/'))) {
        // Runtime dependency - resolve dot notation to file path
        const targetPath = resolveRuntimePath(imp.source, deps);
        target = targetPath ? deps.find(other => other.filepath === targetPath) : null;
      } else {
        // Static import - use improved matching logic
        target = deps.find(other =>
          other.filepath && other.filepath !== d.filepath && matchImportToFile(imp.source, other.filepath)
        );
      }

      if (target && target.filepath && target.filepath !== d.filepath) {
        // Create a unique key for this link (source -> target)
        const linkKey = `${d.filepath}||${target.filepath}`;

        // Only add if we haven't seen this link before
        if (!seenLinks.has(linkKey)) {
          seenLinks.add(linkKey);
          links.push({
            source: d.filepath,
            target: target.filepath,
            type: imp.runtime ? 'runtime' : 'static'  // Optional: for styling
          });
        }
      }
    }
  }
  return c.json({ nodes, links });
});