# VibeScout: Local Code Intelligence & MCP Server

A high-performance Model Context Protocol (MCP) server and Web Dashboard for local semantic code search and AI-powered assistance. VibeScout transforms your codebase into a searchable, chat-ready knowledge base using local or cloud-based AI providers.

## 🚀 Features

- **Web Dashboard**: A modern React-based UI for visual searching, chatting with your code, and managing your knowledge base.
- **Adaptive Concurrency**: Automatically detects provider rate limits (like Z.AI's concurrency errors) and dynamically scales request rates for optimal performance.
- **Resilient AI Tasks**: Built-in automatic retries with exponential backoff for failed API calls due to network or rate-limiting issues.
- **Live System Activity**: A terminal-style activity drawer in the UI showing real-time watcher events, indexing progress, and API logs.
- **AI Inspector (Debug)**: A deep-dive panel to inspect exact prompts, payloads, and raw API responses in real-time.
- **"Ask AI" Integration**: Jump directly from a search result to a chat session with all relevant code context automatically pre-filled.
- **Advanced Search Filtering**: Precision search and chat. Filter results by **Project**, **Collection**, or multiple **File Extensions** (e.g., `.ts, .js`).
- **Proactive Indexing**: Connect folders directly from the browser with real-time indexing progress bars.
- **Separate LLM & Embedding Config**: Independently configure your embedding models (e.g., local BGE) and your chat LLMs (e.g., Claude 3.5 or GPT-4o).
- **Deep Code Intelligence**: Full **Markdown support** and **Syntax Highlighting**. Visual dependency graph with a **Symbol Intelligence** panel showing exports/imports.
- **IDE Integration**: "Open in Editor" support with precise **line-level navigation** for VS Code and Cursor.
- **Multi-Language Support**: TypeScript/JS, Python, Go, Java, Kotlin, Dart, Markdown, JSON, TOML, and XML.
- **Hybrid Storage**: Use local **LanceDB** for speed or **Cloudflare Vectorize** for cloud-synchronized embeddings.

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
```

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
ISC License. See [LICENSE](LICENSE) for details.
