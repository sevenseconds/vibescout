# VibeScout: Local MCP Code Search Server

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
  - `background` (boolean, optional): If `true`, runs in background and returns immediately.

### 2. `get_indexing_status`
Check progress of current background indexing task.

### 3. `search_code`
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

## Docker

You can run VibeScout in a container to keep your environment clean and isolated.

### Using Docker Compose

The easiest way to manage one or more projects is with `docker-compose.yml`.

1.  **Mount your projects**: Edit `docker-compose.yml` to mount a parent directory containing your codebases:
    ```yaml
    volumes:
      - ./data:/app/.lancedb
      - /path/to/your/workspaces:/projects:ro
    ```
2.  **Start the server**:
    ```bash
    docker-compose up -d
    ```

### Handling Multiple Projects
If you mount a root workspace folder (e.g., `~/Workspaces` to `/projects`), you can index any sub-folder by referring to its path **inside** the container.

**Tip for LLMs**: When using VibeScout in Docker, you should provide context to your AI so it knows where to look. We provide templates (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`) that you can copy into your target projects.

These files tell the AI:
> "I am running VibeScout in Docker. My local projects are mounted at `/projects`. To index a project, use the path `/projects/<project-folder-name>`."

### Using Docker CLI

```bash
# Build the image
docker build -t vibescout .

# Run the container
docker run -it \
  -v $(pwd)/.lancedb:/app/.lancedb \
  -v /path/to/your/workspaces:/projects:ro \
  vibescout
```

## Client Integration

### Claude Desktop / Gemini CLI / OpenCode
Add the following to your configuration:

```json
{
  "mcpServers": {
    "vibescout": {
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
claude mcp add vibescout --transport stdio -- npm start --prefix /path/to/your/project
```

## Development

- **Architecture**: Uses the **Strategy Pattern** for extractors located in `src/extractors/`.
- **Testing**: `npm test` (Runs Vitest sequentially to prevent DB race conditions).
- **Linting**: `npm run lint` (ESLint with 2-space indentation).