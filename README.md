# VibeScout: Local Code Intelligence & MCP Server

A high-performance Model Context Protocol (MCP) server and Web Dashboard for local semantic code search and AI-powered assistance. VibeScout transforms your codebase into a searchable, chat-ready knowledge base using local or cloud-based AI providers.

## 🚀 Features

- **Web Dashboard**: A modern React-based UI for visual searching, chatting with your code, and managing your knowledge base.
- **Visual Dependency Graph**: Explore architecture visually. Features a **Symbol Intelligence** panel and **Circular Dependency Detection** to spot import loops.
- **AI Smart Questions**: Search results feature a "Generate Best Question" button that analyzes code to suggest the most insightful starting point for chat.
- **Adaptive Concurrency**: Automatically detects provider rate limits (like Z.AI's concurrency errors) and dynamically scales request rates.
- **Real-time Activity (SSE)**: Instant system event streaming (watchers, indexing, API logs) using Server-Sent Events.
- **AI Inspector (Debug)**: Chrome DevTools-style panel to inspect exact prompts, payloads, and raw responses with pretty-formatting.
- **Hono-Powered Backend**: Built on the high-performance Hono framework for ultra-low latency and standard Web Fetch API support.
- **IDE Integration**: "Open in Editor" support with precise **line-level navigation** for VS Code and Cursor.
- **Multi-Language Support**: TypeScript/JS, Python, Go, Java, Kotlin, Dart, Markdown, JSON, TOML, and XML.
- **Hybrid Storage**: Use local **LanceDB** for speed or **Cloudflare Vectorize** for cloud-synchronized embeddings.
- **Category-Aware Search**: Automatically prioritizes source code over documentation for a better "vibe coding" experience.
- **AI Reranker**: Optional second-pass re-sorting of results using local models for extreme technical accuracy.
- **Fully Offline Mode**: Strict local-only operation. Disables all remote model downloads and hub connections.

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
