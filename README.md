# VibeScout: Local MCP Code Search Server

A high-performance Model Context Protocol (MCP) server for local semantic code search. This server uses **Transformers.js** for local embeddings/summarization and **LanceDB** for efficient vector storage.

## Features

- **Multi-Language Support**: Robust semantic extraction for **TypeScript/JS**, **Python**, **Go**, **Java**, **Kotlin**, **Dart**, **Markdown**, **JSON**, **TOML**, and **XML**.
- **Multi-Project Collections**: Group related codebases (e.g., "Frontend", "Backend") for targeted or global search.
- **Hierarchical Context Retrieval**: Automatically summarizes functions and injects that context into logical sub-chunks. The AI never loses the "Big Picture".
- **Interactive TUI**: Beautiful table-based search results with AI context previews and one-click file opening.
- **Project-level Exclusions**: Full support for `.vibeignore` and `.gitignore` files to control exactly what gets indexed.
- **Persistent Configuration**: Dedicated `config` command to manage your local setup visually.
- **Hybrid Search**: Combines **Semantic (Vector)** and **Exact Keyword (FTS)** search for maximum recall and precision.
- **Auto-Context (Reranking)**: Uses a local Cross-Encoder model to surface the absolute most relevant snippets.
- **Structural Knowledge**: Tracks imports and exports to build a dependency graph of your codebase.
- **Semantic Chunking**: Automatically slices large functions (>50 lines) into logical sub-blocks.
- **Incremental & Parallel Indexing**: Processes multiple files concurrently and skips unchanged files using MD5 hashing.
- **Local & Private**: 100% local execution. No data ever leaves your machine.

## MCP Tools

### 1. `index_folder`
Indexes a folder with Contextual Enrichment and Parallelism.
- **Arguments**:
  - `folderPath` (string): Absolute path to the code.
  - `projectName` (string, optional).
  - `collection` (string, optional).
  - `summarize` (boolean, optional): Default `true`. Uses AI to pre-summarize functions.
  - `background` (boolean, optional): If `true`, runs in background and returns immediately.

### 2. `get_indexing_status`
Check progress of current background indexing task.

### 3. `search_code`
Searches the knowledge base using Hybrid Search and Reranking.
- **Arguments**:
  - `query` (string): Natural language or keyword.
  - `collection` (string, optional).
  - `projectName` (string, optional).

### 4. `watch_folder`
Starts a real-time watcher. Automatically updates the index when you add, edit, or delete files.

### 5. `move_project`
Moves a project from one collection to another for better organization.

### 6. `get_file_dependencies`
Returns all imports and exports for a specific file.

### 7. `find_symbol_usages`
Finds all files that import a specific symbol (function, class, etc.).

### 8. `list_knowledge_base`
Displays all indexed projects grouped by their collections.

### 9. `read_code_range`
Reads specific lines from a file.

### 10. `get_current_model`
Returns the currently active Embedding and Summarizer models.

### 11. `set_model`
Switch Embedding model (Options: `Xenova/all-MiniLM-L6-v2`, `Xenova/bge-small-en-v1.5`, `Xenova/bge-m3`).

### 12. `clear_index`
Deletes the local database. Use this before switching models.

## Installation

### Global Installation (Recommended)
You can install VibeScout globally to use it as a standalone command:

```bash
npm install -g @sevenseconds/vibescout
```

Once installed, you can run it anywhere using the `vibescout` command.

## CLI Usage

VibeScout can be used directly from the command line for indexing, searching, and maintenance.

### Interactive Search
```bash
vibescout search "how do I handle authentication?"
```
*(Displays an interactive table. Select a result to open it in your default editor)*

### Interactive Configuration
```bash
vibescout config
```
*(Launches a TUI to manage models, paths, and server settings)*

### Database Maintenance
```bash
vibescout compact
```
*(Removes stale files and optimizes database storage)*

### Index a folder
```bash
vibescout index ./my-project "My Project Name"
```

### Options
- `--mcp [mode]`: Specify the MCP transport mode. Options: `stdio` (default), `sse`, `http`.
- `--models-path <path>`: Specify local path for models.
- `--offline`: Force offline mode.
- `--port <number>`: Port for `sse` or `http` server (default: 3000).
- `--verbose`: Enable verbose debug logs (shows model loading progress).

### Transport Modes

#### Stdio (Default)
Ideal for local use with Claude Desktop or Gemini CLI.
```bash
vibescout
```

#### SSE (Server-Sent Events)
Starts a standard HTTP server with an `/mcp` endpoint.
```bash
vibescout --mcp sse
```
*MCP Endpoint: `http://localhost:3000/mcp`*

#### HTTP (Streamable)
Starts a modern streamable HTTP server using the latest MCP spec.
```bash
vibescout --mcp http
```
*MCP Endpoint: `http://localhost:3000/mcp`*

## Client Integration

### Claude Desktop / Gemini CLI / OpenCode
Add the following to your configuration:

```json
{
  "mcpServers": {
    "vibescout": {
      "command": "npx",
      "args": ["-y", "@sevenseconds/vibescout"],
      "env": {
        "EMBEDDING_MODEL": "Xenova/bge-small-en-v1.5",
        "MODELS_PATH": "/path/to/your/local/models",
        "OFFLINE_MODE": "false"
      }
    }
  }
}
```

### Claude Code (CLI)
```bash
claude mcp add vibescout -- npx -y @sevenseconds/vibescout
```

### Offline Mode & Custom Model Paths
If you are behind a strict firewall or want to use VibeScout without an internet connection:

1.  **Download models**: Download the required models from Hugging Face (Xenova's versions) to a local directory.
2.  **Configuration**: You can use either environment variables or CLI flags.

**Option A: Environment Variables**
- `MODELS_PATH`: Absolute path to the directory containing your model folders.
- `OFFLINE_MODE`: Set to `true` to prevent any attempts to connect to the Hugging Face Hub.

**Option B: CLI Arguments**
```bash
vibescout --models-path /path/to/models --offline
```

## Contributing
Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our development process.