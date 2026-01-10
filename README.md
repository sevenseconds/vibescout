# Local MCP Code Search Server

A Model Context Protocol (MCP) server for local semantic code search. This server uses **Transformers.js** for local embeddings (no internet required after initial model download) and **LanceDB** for efficient vector storage.

## Features

- **Multi-Project Collections**: Group related codebases (e.g., "Company-A", "Personal") for targeted cross-project search.
- **Hierarchical Context Retrieval**: Automatically summarizes functions and injects that context into logical sub-chunks. This ensures the AI never loses the "Big Picture" (Default: Enabled).
- **Hybrid Search**: Combines **Semantic (Vector)** and **Exact Keyword (FTS)** search for maximum accuracy.
- **Auto-Context (Reranking)**: Uses a local reranker model to surface the absolute most relevant snippets.
- **Semantic Chunking**: Automatically slices large functions (>50 lines) into logical sub-blocks for higher search precision.
- **BGE-M3 Support**: High-performance embedding model with 8k token context support.
- **Parallel Indexing**: Processes multiple files concurrently for 3-5x faster speed.
- **Incremental Indexing**: Skips unchanged files using MD5 hashing.

## MCP Tools

### 1. `index_folder`
Indexes a folder with Contextual Enrichment.
- **Arguments**:
  - `folderPath` (string): Absolute path to the code.
  - `projectName` (string, optional).
  - `collection` (string, optional).
  - `summarize` (boolean, optional): Default is `true`. Use hierarchical AI summaries for maximum search accuracy.

### 2. `set_model`
Changes the embedding model.
- **Argument**: `modelName` (string) - Options: `Xenova/all-MiniLM-L6-v2` (fast), `Xenova/bge-small-en-v1.5`, or `Xenova/bge-m3` (elite).

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
