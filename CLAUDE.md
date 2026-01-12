# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeScout is a high-performance Model Context Protocol (MCP) server for local semantic code search and AI-powered assistance. It transforms codebases into searchable, chat-ready knowledge bases using local or cloud-based AI providers.

## Commands

### Development
```bash
# Run tests
npm test

# Run a specific test file
npx vitest run tests/embeddings.test.js

# Lint code
npm run lint

# Build UI
npm run build:ui
```

### Server Operations
```bash
# Start Web UI (dashboard at http://localhost:3000)
vibescout ui

# Start MCP server (stdio mode for Claude Desktop/Cursor)
vibescout --mcp stdio

# Start MCP server (HTTP/SSE mode)
vibescout --mcp sse --port 3000

# Index a folder
vibescout index ./my-project "My Project"

# Force full re-index
vibescout index ./my-project "My Project" --force

# Search from terminal
vibescout search "how does auth work?"

# Compact database (remove stale files)
vibescout compact

# Reset database (clear all data)
vibescout reset
```

### UI Development
```bash
cd ui
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run lint     # Lint UI code
```

## Architecture

### Entry Points
- `src/index.js` - Main CLI entry point using Commander.js
- `bin/vibescout.js` - Executable wrapper
- `src/server.js` - MCP server and HTTP API (Hono-based)

### Core Systems

**Provider Architecture** (`src/providers/`)
- All providers implement `EmbeddingProvider` and/or `SummarizerProvider` interfaces from `base.ts`
- Embedding providers generate vectors: `generateEmbedding(text)` or `generateEmbeddingsBatch(texts)`
- Summarizer providers handle LLM operations: `summarize()`, `generateBestQuestion()`, `generateResponse()`
- Providers include: Local (Transformers.js), Ollama, OpenAI, Gemini, Cloudflare, Z.AI, Bedrock
- `src/embeddings.ts` - Manages provider instances with adaptive concurrency throttling

**Storage Layer** (`src/database/`)
- `LanceDBProvider.ts` - Local vector database (default)
- `VectorizeProvider.ts` - Cloudflare Vectorize integration
- `base.ts` - Database interface defining `createTable()`, `addDocuments()`, `search()`, `hybridSearch()`

**File Extraction** (`src/extractors/`)
- Strategy pattern with language-specific extractors using tree-sitter parsers
- Each extractor implements: extract functions, classes, imports/exports, symbols
- Supported: TypeScript, Python, Go, Dart, Java, Kotlin, Markdown, JSON, TOML, XML
- `extractor.js` - Main orchestration

**Indexing Pipeline** (`src/core.js`)
- `handleIndexFolder()` - Main entry point for folder indexing
- Flow: Scan files → Extract code blocks → Generate summaries → Create embeddings → Store
- Incremental updates via file hash tracking
- Global `indexingProgress` object tracks status for UI
- Concurrency limit of 16 parallel operations

**File Watching** (`src/watcher.ts`)
- Chokidar-based real-time file monitoring
- Queues changed files for background re-indexing
- Projects managed via watch list in config

### MCP Tools (defined in `src/server.js`)
Core tools exposed to AI assistants:
- `index_folder` - Index codebase with AI summarization
- `search_code` - Vector search with BGE reranking
- `watch_folder` - Enable real-time watching
- `get_file_dependencies` - Import/export analysis
- `find_symbol_usages` - Find where symbols are used
- `chat_with_code` - RAG-powered chat with context
- `read_file` - Read full content of a file
- `read_code_range` - Read specific line range for analysis
- `move_project`, `clear_database`, `compact_database` - Management operations

### Web UI (`ui/`)
- React + TypeScript with React Router
- Tailwind CSS for styling
- Key views:
  - `SearchView.tsx` - Semantic search with results
  - `ChatView.tsx` - AI chat interface
  - `GraphView.tsx` - Dependency graph visualization
  - `KBView.tsx` - Knowledge base management
  - `ConfigView.tsx` - Provider and settings configuration
- API communication via axios to backend endpoints

### API Endpoints (Hono in `src/server.js`)
- `/api/search` - Vector search
- `/api/chat` - AI chat with streaming
- `/api/graph` - Dependency data
- `/api/config` - Runtime config management
- `/api/events` - SSE endpoint for real-time activity
- `/mcp` - MCP transport endpoint (SSE/HTTP mode)

## Key Patterns

**Configuration** (`src/config.js`)
- Config stored in `~/.vibescout/config.json`
- `loadConfig()` reads, `saveConfig()` writes
- Provider selection, model names, API keys, throttling settings

**Logging** (`src/logger.js`)
- Custom logger with levels: DEBUG, INFO, WARN, ERROR, NONE
- Set via CLI flags or config
- Use throughout codebase for consistent output

**Throttling** (`src/throttler.ts`)
- Adaptive concurrency for providers with rate limits
- Automatically backs off on throttling errors
- Configurable error patterns in config

**Testing**
- Vitest for test runner
- Test files in `tests/` directory
- Include `.test.js` suffix

## TypeScript Configuration
- Root `tsconfig.json` for `src/` - ESNext target, NodeNext module
- UI `tsconfig.json` for React/Vite
- Mixed JS/TS codebase: providers and database use TS, core uses JS

## Project Structure Notes
- `src/` - Main backend (mostly JS, some TS for type safety)
- `src/providers/` - AI provider implementations (TypeScript)
- `src/database/` - Vector database providers (TypeScript)
- `src/extractors/` - Language-specific extractors (JavaScript)
- `ui/` - React frontend (TypeScript + Vite)
- `tests/` - Vitest test suites (JavaScript)

## LanceDB Column Naming Convention (CRITICAL)

**ALL LanceDB column names MUST be lowercase or snake_case. NEVER use camelCase or PascalCase.**

This is a critical requirement that often causes bugs when not followed.

### Examples

#### ✅ CORRECT - Lowercase or Snake_Case
```typescript
const record = {
  filepath: "/path/to/file.js",          // lowercase
  projectname: "my-project",              // lowercase
  collection: "default",                  // lowercase
  last_commit_author: "John Doe",         // snake_case
  commit_count_6m: 42,                    // snake_case
  churn_level: "high"                     // snake_case
};
```

#### ❌ WRONG - CamelCase or PascalCase
```typescript
const record = {
  filePath: "/path/to/file.js",          // ❌ FAILS - undefined when queried
  projectName: "my-project",              // ❌ FAILS - undefined when queried
  Collection: "default",                  // ❌ FAILS - undefined when queried
  lastCommitAuthor: "John Doe",           // ❌ FAILS - undefined when queried
  commitCount6m: 42,                      // ❌ FAILS - undefined when queried
  churnLevel: "high"                      // ❌ FAILS - undefined when queried
};
```

### Why This Matters

LanceDB stores column names exactly as provided. When querying, you must use the exact same casing:

```typescript
// Storing data (in db.ts)
const record = {
  filepath: "/path/to/file.js",
  projectname: "my-project"
};
await table.add([record]);

// Querying data (in server.js or elsewhere)
const results = await table.query().toArray();
console.log(results[0].filepath);      // ✅ Works! "/path/to/file.js"
console.log(results[0].filePath);      // ❌ undefined!
```

### Current Database Schema

#### Dependencies Table (`src/db.ts:updateDependencies`)
| Column | Type | Casing | Note |
|--------|------|--------|------|
| filepath | string | lowercase | File path |
| projectname | string | lowercase | Project name |
| collection | string | lowercase | Collection name |
| imports | string (JSON) | lowercase | Import metadata |
| exports | string (JSON) | lowercase | Export metadata |

#### Code Search Table (embeddings)
| Column | Type | Casing | Note |
|--------|------|--------|------|
| filepath | string | lowercase | File path |
| projectname | string | lowercase | Project name |
| collection | string | lowercase | Collection name |
| name | string | lowercase | Symbol/block name |
| type | string | lowercase | Block type |
| category | string | lowercase | Code/documentation |
| startline | number | lowercase | Start line |
| endline | number | lowercase | End line |
| summary | string | lowercase | AI summary |
| comments | string | lowercase | Extracted comments |
| content | string | lowercase | Code content |
| vector | number[] | lowercase | Embedding vector |

#### Git Metadata Columns (v0.2.14+)
| Column | Type | Casing | Note |
|--------|------|--------|------|
| last_commit_author | string | snake_case | Commit author name |
| last_commit_email | string | snake_case | Author email |
| last_commit_date | string | snake_case | ISO date string |
| last_commit_hash | string | snake_case | Git commit hash |
| last_commit_message | string | snake_case | Commit message |
| commit_count_6m | number | snake_case | Commits in 6 months |
| churn_level | string | snake_case | low/medium/high |

### Best Practices

1. **Always check the schema** - When adding new columns, use lowercase or snake_case
2. **Match the casing exactly** - When querying, use the exact same casing as stored
3. **Be consistent** - Don't mix camelCase and snake_case in the same table
4. **Document new columns** - Update this section when adding new database fields
5. **Test your queries** - Verify data is retrieved correctly before committing

### TypeScript Interfaces

In TypeScript interfaces (like `src/database/base.ts`), you can use camelCase for type safety, but you must map to/from lowercase when interacting with the database:

```typescript
// TypeScript interface (can use camelCase)
interface SearchResult {
  filepath: string;           // lowercase to match DB
  projectname: string;        // lowercase to match DB
  lastCommitAuthor?: string;  // camelCase for JS convention
}

// When querying, map correctly
const results = await table.query().toArray();
return results.map(r => ({
  ...r,
  lastCommitAuthor: r.last_commit_author  // Map snake_case to camelCase
}));
```

### Related Files
- `src/db.ts` - Database operations with correct column names
- `src/database/base.ts` - TypeScript type definitions
- `src/server.js` - API endpoints that query the database (check casing!)
