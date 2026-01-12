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

## LanceDB Column Naming Convention (CRITICAL)

**All LanceDB column names MUST be lowercase or snake_case. NEVER use camelCase or PascalCase.**

### ✅ CORRECT
```typescript
const record = {
  filepath: "/path/to/file.js",      // lowercase
  project_name: "my-project",        // snake_case
  last_commit_author: "John Doe",    // snake_case
  collection: "default",              // lowercase
};
```

### ❌ WRONG
```typescript
const record = {
  filePath: "/path/to/file.js",      // ❌ camelCase - WILL FAIL
  projectName: "my-project",          // ❌ camelCase - WILL FAIL
  lastCommitAuthor: "John Doe",       // ❌ camelCase - WILL FAIL
  Collection: "default",              // ❌ PascalCase - WILL FAIL
};
```

### Database Schema Reference

#### dependencies table
| Column | Type | Naming |
|--------|------|---------|
| filepath | string | lowercase |
| projectname | string | lowercase |
| collection | string | lowercase |
| imports | string (JSON) | lowercase |
| exports | string (JSON) | lowercase |

#### code_search table
| Column | Type | Naming |
|--------|------|---------|
| filepath | string | lowercase |
| projectname | string | lowercase |
| collection | string | lowercase |
| name | string | lowercase |
| type | string | lowercase |
| category | string | lowercase |
| startline | number | lowercase |
| endline | number | lowercase |
| summary | string | lowercase |
| comments | string | lowercase |
| content | string | lowercase |
| vector | number[] | lowercase |

#### Git Metadata Columns (v0.2.14+)
| Column | Type | Naming |
|--------|------|---------|
| last_commit_author | string | snake_case |
| last_commit_email | string | snake_case |
| last_commit_date | string | snake_case |
| last_commit_hash | string | snake_case |
| last_commit_message | string | snake_case |
| commit_count_6m | number | snake_case |
| churn_level | string | snake_case |

### Why This Matters

When querying LanceDB, the column names in the database **MUST EXACTLY MATCH** what you use in your code:

```typescript
const result = await table.query().toArray();
console.log(result[0].filePath);  // undefined ❌
console.log(result[0].filepath);  // "/path/to/file.js" ✅
```

### Best Practices

1. **Always use lowercase or snake_case for database columns**
2. **Be consistent** - if you use snake_case for git columns (last_commit_author), use it everywhere
3. **Document the schema** - keep this reference updated when adding new columns
4. **Test your queries** - verify column names match what's in the database
