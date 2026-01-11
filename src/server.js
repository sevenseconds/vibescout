import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import fs from "fs-extra";
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';
import { logger } from "./logger.js";
import {
  handleIndexFolder,
  handleSearchCode,
  searchCode,
  chatWithCode,
  openFile,
  indexingProgress
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
} from "./db.js";import { watchProject, unwatchProject, initWatcher } from "./watcher.js";
import { embeddingManager, summarizerManager } from "./embeddings.js";
import { loadConfig, saveConfig } from "./config.js";

// MCP Server Setup
export const server = new Server(
  {
    name: "vibescout",
    version: "0.5.0",
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
        description: "Search across knowledge base with Reranking.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            collection: { type: "string" },
            projectName: { type: "string" },
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
        description: "Read lines from a file",
        inputSchema: {
          type: "object",
          properties: { filePath: { type: "string" }, startLine: { type: "number" }, endLine: { type: "number" } },
          required: ["filePath", "startLine", "endLine"],
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
    if (name === "search_code") return await handleSearchCode(args.query, args.collection, args.projectName);
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
      const content = await fs.readFile(args.filePath, "utf-8");
      const lines = content.split("\n");
      return { content: [{ type: "text", text: lines.slice(args.startLine - 1, args.endLine).join("\n") }] };
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

app.post('/api/index', async (c) => {
  const { folderPath, projectName, collection, summarize } = await c.req.json();
  handleIndexFolder(folderPath, projectName, collection || "default", summarize !== false, true)
    .catch(err => logger.error(`Background indexing error: ${err.message}`));
  return c.json({ success: true, message: "Indexing started in background" });
});

app.get('/api/index/status', (c) => c.json(indexingProgress));

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
  const { query, collection, projectName, fileTypes } = await c.req.json();
  const results = await searchCode(query, collection, projectName, fileTypes);
  return c.json(results);
});

app.post('/api/search/summarize', async (c) => {
  const { query, results } = await c.req.json();
  
  const context = results.slice(0, 5).map(r => 
    `File: ${r.filePath}\nCode:\n${r.content.substring(0, 1000)}`
  ).join("\n\n---\n\n");

  const prompt = `I have searched my codebase for "${query}". 
Based on the code snippets found below, what is the most insightful and technically accurate question I should ask a chat assistant to understand how this specific logic is implemented and how it relates to my query?

Provide only the question text, no preamble.

Context:
${context}`;

  const summary = await summarizerManager.generateResponse(prompt, "You are a code architect helping a developer formulate the best question about their search results.");
  return c.json({ summary });
});

app.post('/api/chat', async (c) => {
  const { query, collection, projectName, fileTypes } = await c.req.json();
  const history = await getChatMessages();
  const response = await chatWithCode(query, collection, projectName, history, fileTypes);
  
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

app.get('/api/graph', async (c) => {
  const deps = await getAllDependencies();
  const nodes = [];
  const links = [];
  
  if (!deps || deps.length === 0) return c.json({ nodes, links });

  const nodeMap = new Map();
  for (const d of deps) {
    if (!nodeMap.has(d.filePath)) {
      const node = { id: d.filePath, label: path.basename(d.filePath), group: d.projectName, collection: d.collection };
      nodes.push(node);
      nodeMap.set(d.filePath, node);
    }
  }

  for (const d of deps) {
    const imports = JSON.parse(d.imports);
    for (const imp of imports) {
      const target = deps.find(other => 
        other.filePath.endsWith(imp.source) || 
        other.filePath.endsWith(imp.source + ".ts") ||
        other.filePath.endsWith(imp.source + ".js") ||
        other.filePath.endsWith(imp.source + ".dart") ||
        other.filePath.endsWith(imp.source + ".java") ||
        other.filePath.endsWith(imp.source + ".kt")
      );
      if (target && target.filePath !== d.filePath) {
        links.push({ source: d.filePath, target: target.filePath });
      }
    }
  }
  return c.json({ nodes, links });
});