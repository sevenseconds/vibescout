# Project Overview: VibeScout

VibeScout is a high-performance Local Code Intelligence platform and Model Context Protocol (MCP) server. It enables semantic code search, architectural visualization, and RAG-powered chat by transforming local codebases into searchable knowledge bases.

## Core Technologies
- **Backend**: [Hono](https://hono.dev/) (High-performance web framework)
- **Database**: [LanceDB](https://lancedb.com/) (Local vector database) & [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/)
- **Code Analysis**: [tree-sitter](https://tree-sitter.github.io/tree-sitter/) for multi-language parsing and dependency extraction
- **Frontend**: React (Vite, Tailwind CSS, Material Design)
- **AI Integration**: Support for Local (Transformers.js), Ollama, OpenAI, Gemini, Bedrock, and Z.AI
- **Communication**: Model Context Protocol (MCP) and Server-Sent Events (SSE)

## Architecture
- `bin/`: CLI entry point (`vibescout.js`).
- `src/core.js`: Orchestrates indexing, semantic search, and RAG logic.
- `src/server.js`: Hosts the Hono API and the MCP server implementation.
- `src/db.ts`: Data access layer for LanceDB and metadata (hashes, dependencies, chat history).
- `src/extractors/`: Language-specific strategies (JS/TS, Python, Go, etc.) for granular code block extraction.
- `src/providers/`: Extensible adapters for different embedding and LLM providers.
- `ui/`: React-based dashboard for visual search and configuration.

## Building and Running

### Prerequisites
- Node.js (Latest LTS recommended)
- `npm`

### Setup
```bash
# Install dependencies
npm install

# Build the UI
npm run build:ui
```

### Post-Implementation Requirement
**CRITICAL**: After completing any code modification or feature implementation, you must execute `npm run build:ui` to ensure the production dashboard remains synchronized with the backend changes.

### Execution
```bash
# Start the server / CLI
npm start

# Run in UI mode
node bin/vibescout.js ui

# Run tests
npm test
```

## Development Conventions

### Coding Style
- **ES Modules**: The project uses modern ESM (`"type": "module"`).
- **TypeScript & JavaScript**: Core logic is a mix of TS and JS; new modules should prefer TypeScript.
- **Extraction**: When adding support for new languages, implement a new strategy in `src/extractors/` using `tree-sitter`.
- **Logging**: Use the centralized logger in `src/logger.js` for consistent output formatting.

### Testing
- **Vitest**: The primary testing framework. Run `npm test` to execute the suite.
- **File Parallelism**: Note that tests are configured with `--fileParallelism=false` in `package.json` to prevent database locks during concurrent runs.

### MCP Integration
- VibeScout exposes several tools (e.g., `index_folder`, `search_code`, `get_file_dependencies`) via the MCP protocol, allowing it to be used as a backend for AI clients like Claude Desktop or Gemini CLI.
