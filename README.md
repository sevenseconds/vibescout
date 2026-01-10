# Local MCP Code Search Server

A high-performance Model Context Protocol (MCP) server for local semantic code search. This server uses **Transformers.js** for local embeddings/summarization and **LanceDB** for efficient vector storage.

## Features

- **Multi-Project Collections**: Group related codebases (e.g., "Frontend", "Backend") for targeted or global search.
- **Hierarchical Context Retrieval**: Automatically summarizes functions and injects that context into logical sub-chunks. The AI never loses the "Big Picture".
- **Hybrid Search**: Combines **Semantic (Vector)** and **Exact Keyword (FTS)** search for maximum recall and precision.
- **Auto-Context (Reranking)**: Uses a local Cross-Encoder model to surface the absolute most relevant snippets.
- **Structural Knowledge**: Tracks imports and exports to build a dependency graph of your codebase.
- **Markdown Indexing**: Full support for `.md` documentation, split intelligently by headings.
- **Semantic Chunking**: Automatically slices large functions (>50 lines) into logical sub-blocks.
- **Incremental & Parallel Indexing**: Processes multiple files concurrently and skips unchanged files using MD5 hashing.
- **Watch Mode**: Real-time monitoring of folders for automatic indexing of changes and deletions.
- **Local & Private**: 100% local execution. No data ever leaves your machine.

## MCP Tools

### 1. `index_folder`
Indexes a folder with Contextual Enrichment and Parallelism.
- **Arguments**:
  - `folderPath` (string): Absolute path to the code.
  - `projectName` (string, optional).
  - `collection` (string, optional).
  - `summarize` (boolean, optional): Default `true`. Uses AI to pre-summarize functions.

### 2. `search_code`
Searches the knowledge base using Hybrid Search and Reranking.
- **Arguments**:
  - `query` (string): Natural language or keyword.
  - `collection` (string, optional).
  - `projectName` (string, optional).

### 3. `watch_folder`
Starts a real-time watcher. Automatically updates the index when you add, edit, or delete files.

### 4. `move_project`
Moves a project from one collection to another for better organization.

### 5. `get_file_dependencies`
Returns all imports and exports for a specific file.

### 6. `find_symbol_usages`
Finds all files that import a specific symbol (function, class, etc.).

### 7. `list_knowledge_base`
Displays all indexed projects grouped by their collections.

### 8. `read_code_range`
Reads specific lines from a file.

### 9. `get_current_model`
Returns the currently active Embedding and Summarizer models.

### 10. `set_model`
Switch Embedding model (Options: `Xenova/all-MiniLM-L6-v2`, `Xenova/bge-small-en-v1.5`, `Xenova/bge-m3`).

### 11. `clear_index`
Deletes the local database. Use this before switching models.

## Client Integration

### Claude Desktop / Gemini CLI / OpenCode
Add the following to your configuration:

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

### Claude Code (CLI)
```bash
claude mcp add local-code-search --transport stdio -- npm start --prefix /path/to/your/project
```

## Development

- **Architecture**: Uses the **Strategy Pattern** for extractors located in `src/extractors/`.
- **Testing**: `npm test` (Runs Vitest sequentially to prevent DB race conditions).
- **Linting**: `npm run lint` (ESLint with 2-space indentation).