# Local MCP Code Search Server

A Model Context Protocol (MCP) server for local semantic code search. This server uses **Transformers.js** for local embeddings (no internet required after initial model download) and **LanceDB** for efficient vector storage.

## Features

- **Multi-Project Collections**: Group related codebases (e.g., "Company-A", "Personal") for targeted cross-project search.
- **Hybrid Search**: Combines **Semantic (Vector)** and **Exact Keyword (FTS)** search for maximum accuracy.
- **Auto-Context (Reranking)**: Uses a local reranker model (`bge-reranker-base`) to surface the most relevant code snippets.
- **Incremental Indexing**: Uses file hashing to skip unchanged files, making re-indexing near-instant.
- **Parallel Indexing**: Processes multiple files concurrently using a safe concurrency pool for 3-5x faster indexing.
- **Resilient Extraction**: Powered by **Tree-sitter** to accurately extract code even with syntax errors.
- **Local & Private**: Everything runs on your machine—no data ever leaves your local environment.

## MCP Tools

### 1. `index_folder`
Indexes a folder. Uses **parallel processing** and incremental hashing to only process new or changed files.
- **Arguments**:
  - `folderPath` (string): Absolute path to the code.
  - `projectName` (string, optional): Display name for the project.
  - `collection` (string, optional): Group name (default: "default").

### 2. `search_code`
Searches your knowledge base using Hybrid Search and Reranking.
- **Arguments**:
  - `query` (string): Natural language or keyword query.
  - `collection` (string, optional): Search only within this collection.
  - `projectName` (string, optional): Search only within this specific project.

### 3. `move_project`
Moves a project from one collection to another.
- **Arguments**:
  - `projectName` (string).
  - `newCollection` (string).

### 4. `get_file_dependencies`
Returns all imports and exports for a specific file. Useful for mapping how modules interact.
- **Argument**: `filePath` (string).

### 5. `find_symbol_usages`
Finds all files across your knowledge base that import a specific symbol (function, class, etc.).
- **Argument**: `symbolName` (string).

### 6. `list_knowledge_base`
Displays all indexed projects and their assigned collections.

### 7. `watch_folder`
Starts a real-time watcher on a folder. It will automatically:
- Index new files when added.
- Re-index files when they are changed.
- Remove code from the index when a file is deleted.
- **Arguments**:
  - `folderPath` (string): Absolute path to the folder.
  - `projectName` (string, optional).
  - `collection` (string, optional).

### 8. `read_code_range`
Reads specific lines from a file (useful for inspecting search results).
- **Arguments**:
  - `filePath` (string) - Absolute path to the file.
  - `startLine` (number)
  - `endLine` (number)

### 9. `get_current_model`
Returns the name of the currently active embedding model.

### 10. `set_model`
Changes the embedding model at runtime.
- **Argument**: `modelName` (string) - One of `Xenova/all-MiniLM-L6-v2` or `Xenova/bge-small-en-v1.5`.

### 11. `clear_index`
Deletes the local vector database and file hashes. Use this before re-indexing with a different model.

## Client Integration

### 1. Claude Desktop
Add this to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "local-code-search": {
      "command": "npm",
      "args": ["start", "--prefix", "/path/to/your/project"],
      "env": {
        "EMBEDDING_MODEL": "Xenova/bge-small-en-v1.5"
      }
    }
  }
}
```

*Note: Default model is `Xenova/all-MiniLM-L6-v2`. You can switch to `Xenova/bge-small-en-v1.5` for potentially better accuracy at the cost of slightly more resources.*

### 2. Claude Code (CLI)
You can add the server via the CLI with the environment variable:
```bash
claude mcp add local-code-search --transport stdio -- npm start --prefix /path/to/your/project
```

Or with a specific model:
```bash
claude mcp add local-code-search --transport stdio --env EMBEDDING_MODEL=Xenova/bge-small-en-v1.5 -- npm start --prefix /path/to/your/project
```

### 3. Gemini CLI
Add this to your `~/.gemini/settings.json` (or `.gemini/settings.json` in your project):

```json
{
  "mcpServers": {
    "local-code-search": {
      "command": "npm",
      "args": ["start", "--prefix", "/path/to/your/project"],
      "env": {
        "EMBEDDING_MODEL": "Xenova/bge-small-en-v1.5"
      }
    }
  }
}
```

### 4. OpenCode IDE
Add the following to your `opencode.json` or `~/.opencode.json`:

```json
{
  "mcp": {
    "local-code-search": {
      "type": "local",
      "command": ["npm", "start", "--prefix", "/path/to/your/project"],
      "enabled": true,
      "environment": {
        "EMBEDDING_MODEL": "Xenova/bge-small-en-v1.5"
      }
    }
  }
}
```

*Note: Always use absolute paths for the `index.js` file.*

## Development

- **Linting**: `npm run lint`
- **Testing**: `npm test`
- **Project Structure**:
  - `src/`: Source code for the MCP server.
  - `tests/`: Unit tests for extraction, embeddings, and database.
  - `.lancedb/`: Local vector database storage (generated after indexing).
