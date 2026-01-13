# VibeScout: Local Code Intelligence & MCP Server

A high-performance Model Context Protocol (MCP) server and Web Dashboard for local semantic code search and AI-powered assistance. VibeScout transforms your codebase into a searchable, chat-ready knowledge base using local or cloud-based AI providers.

## 🚀 Features

### Core Capabilities
- **Web Dashboard**: A modern React-based UI for visual searching, chatting with your code, and managing your knowledge base.
- **Semantic Code Search**: Fast vector-based search with BGE reranking for extreme technical accuracy.
- **Visual Dependency Graph**: Explore architecture visually with **Symbol Intelligence** panel and **Circular Dependency Detection**.
- **AI-Powered Chat**: Persistent context chat with RAG-powered code understanding.
- **Real-time File Watching**: Automatic re-indexing when files change (chokidar-based).

### Search & Filtering
- **Category Pre-Filtering**: Database-level filtering by Code/Docs for maximum performance (default: Code-only).
- **Token Count Preview**: Preview search results before consuming tokens with two-phase search (MCP only).
- **Git Metadata**: Enhanced search with author, date, churn level, and commit history.
- **Dependencies Display**: View imports/exports for each search result with source tracking.
- **Search Persistence**: Results persist across tab switches for seamless workflow.
- **Framework Detection**: Auto-detects Next.js, React Router, Vue, Angular, and 10+ frameworks.

### Plugin System
- **Modular Architecture**: Built-in, npm, and local plugin support with override detection.
- **Versioned Structure**: `/src/plugins/<name>/<version>/` for built-in plugins.
- **Compatibility Checking**: Auto-disables incompatible plugins with clear warnings.
- **Runtime Toggle**: Enable/disable plugins via UI or config file.
- **Sandboxed Execution**: Isolated worker threads for safe plugin operation.

### Advanced Features
- **Two-Phase Search**: Preview search metadata before consuming tokens (MCP only).
- **AI Smart Questions**: "Generate Best Question" analyzes code to suggest optimal chat starting points.
- **Adaptive Concurrency**: Automatically detects provider rate limits and dynamically scales request rates.
- **Real-time Activity (SSE)**: Instant system event streaming via Server-Sent Events.
- **AI Inspector (Debug)**: Chrome DevTools-style panel to inspect prompts, payloads, and responses.
- **IDE Integration**: "Open in Editor" with line-level navigation for VS Code and Cursor.
- **Performance Profiling**: Built-in profiling with Chrome DevTools flame graphs for optimizing indexing and search performance.

### Technical Stack
- **Hono-Powered Backend**: Ultra-low latency with standard Web Fetch API support.
- **Multi-Language Support**: TypeScript/JS, Python, Go, Java, Kotlin, Dart, Markdown, JSON, TOML, XML.
- **Hybrid Storage**: Local **LanceDB** or **Cloudflare Vectorize** for cloud embeddings.
- **AI Reranker**: Optional second-pass re-sorting with local models.
- **Fully Offline Mode**: Strict local-only operation, no remote model downloads.

## 🤖 Supported Providers

| Provider | Type | Description |
| :--- | :--- | :--- |
| **Local** | Built-in | Transformers.js (BGE, MiniLM). High-speed, zero config. |
| **Ollama** | Local API | Full support for local models like Llama 3, Mistral, and Nomic. |
| **Z.AI** | Cloud | BigModel.cn integration. Supports **GLM-4** and dedicated **Coding Plans**. |
| **Bedrock** | Cloud | AWS Bedrock (Claude 3, Titan). Supports AWS Profiles. |
| **Gemini** | Cloud | Google Generative AI (1.5 Flash/Pro) and specialized embeddings. |
| **OpenAI** | Cloud | Standard OpenAI API or compatible (DeepSeek, Groq, etc). |
| **Cloudflare** | Cloud | Workers AI & Vectorize integration for cloud-native indexing. |
| **LM Studio** | Local API | OpenAI-compatible local server preset. |

## 🔌 Plugin System

VibeScout features a powerful plugin system for extending functionality:

### Plugin Sources
- **Built-in Plugins**: Shipped with VibeScout (`/src/plugins/<name>/<version>/`)
- **npm Packages**: Install via `vibescout plugin install <name>`
- **Local Plugins**: Place in `~/.vibescout/plugins/`

### Plugin Capabilities
- **Extractors**: Custom code extraction strategies (e.g., framework-specific metadata)
- **Providers**: Custom embedding/summarizer providers
- **Commands**: CLI commands for framework-specific operations

### Plugin Management
```bash
# List plugins
vibescout plugin list

# Install from npm
vibescout plugin install vibescout-plugin-nextjs

# Install specific version
vibescout plugin install vibescout-plugin-nextjs@beta

# Uninstall
vibescout plugin uninstall vibescout-plugin-nextjs

# Enable/Disable (via Web UI or config.json)
# Plugins are stored in ~/.vibescout/config.json
```

### Plugin Development
See `/docs/` directory for:
- `plugin-guide.md` - Getting started
- `plugin-api.md` - API reference
- `plugin-architecture.md` - Design patterns
- `plugin-example.md` - Complete example
- `two-phase-search.md` - Two-phase search with token count preview
- `profiling-guide.md` - Performance profiling and optimization

## 🛠 Installation

### Global Installation
```bash
npm install -g @sevenseconds/vibescout
```

## 💻 CLI Usage

### Web UI
Launch the interactive dashboard:
```bash
vibescout ui
```

### Advanced Logging
Control terminal output verbosity:
```bash
# Default is INFO (concise)
vibescout ui --log-level warn

# Full debug output (alias for --log-level debug)
vibescout ui --verbose
```

### Indexing & Search
```bash
# Index a project manually
vibescout index ./my-app "My Project"

# Semantic search via terminal
vibescout search "how does the auth flow work?"

# Reset the database (clear all data)
vibescout reset
# Or via npm
npm run reset-db
```

### Two-Phase Search (MCP Only)

When using VibeScout with Claude Desktop, Cursor, or other MCP clients, you can preview search results before consuming tokens:

**Phase 1: Preview Token Count**
```json
{
  "name": "search_code",
  "arguments": {
    "query": "authentication flow",
    "limit": 20,
    "previewOnly": true
  }
}
```

This returns metadata without actual code:
- Result count
- Total tokens (from stored counts during indexing)
- Average relevance score
- Recommendation on whether to proceed

**Phase 2: Fetch Results (if tokens are acceptable)**
```json
{
  "name": "search_code",
  "arguments": {
    "query": "authentication flow",
    "limit": 10,
    "previewOnly": false
  }
}
```

**Benefits:**
- Avoid unexpected token consumption
- Adjust `limit` parameter based on preview
- Use more specific filters if token count is high
- Backward compatible: omit `previewOnly` for existing behavior

### Performance Profiling
```bash
# Profile with 100% sampling (most detailed)
vibescout --profile index ./my-app "My Project"

# Profile with 10% sampling (lower overhead)
vibescout --profile --profile-sampling 0.1 search "authentication"

# Dedicated profiling command
vibescout profile index --folder ./my-app --sampling 1.0

# View traces in chrome://tracing
# Traces saved to ~/.vibescout/profiles/
```

**Profiling Features**:
- Zero overhead when disabled (default)
- Chrome DevTools-compatible flame graphs
- Configurable sampling rates (0.0-1.0) to reduce overhead
- Category-based sampling (indexing, search, embedding, database)
- Web UI dashboard at http://localhost:3000/performance

**See [`docs/profiling-guide.md`](docs/profiling-guide.md) for detailed documentation.**

## 🔒 Offline Mode

To use VibeScout in a restricted environment without internet access:

1. **Download Models**: In an online environment, let VibeScout download the models first, or download them manually from Hugging Face.
2. **Enable Offline Mode**: Toggle **Offline Mode** in **Settings** or run with the `--offline` flag.
3. **Local Path**: Use `--models-path <path>` if your models are stored in a non-standard directory.

When enabled, VibeScout sets `allowRemoteModels: false` and disables all attempts to connect to the Hugging Face Hub.

## 🔌 Client Integration

### Claude Desktop / Gemini CLI
Add VibeScout to your configuration:

```json
{
  "mcpServers": {
    "vibescout": {
      "command": "vibescout",
      "args": ["--mcp", "stdio"]
    }
  }
}
```

## 📄 License
MIT License. See [LICENSE](LICENSE) for details.
