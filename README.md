# VibeScout: Local Code Intelligence & MCP Server

A high-performance Model Context Protocol (MCP) server and Web Dashboard for local semantic code search and AI-powered assistance. VibeScout transforms your codebase into a searchable, chat-ready knowledge base using local or cloud-based AI providers.

## 🚀 Features

- **Web Dashboard**: A modern React-based UI for visual searching, chatting with your code, and managing your knowledge base.
- **Chat with Code (RAG)**: Ask natural language questions about your codebase. VibeScout maintains persistent conversation history and answers using your preferred AI provider.
- **Visual Dependency Graph**: Explore your codebase architecture visually. Understand how files and symbols are connected across projects.
- **Multi-Language Support**: Robust semantic extraction for **TypeScript/JS**, **Python**, **Go**, **Java**, **Kotlin**, **Dart**, **Markdown**, **JSON**, **TOML**, and **XML**.
- **Multi-Provider AI**: Flexible support for **Ollama**, **LM Studio**, **OpenAI**, **Google Gemini**, **AWS Bedrock**, **Z.AI**, **Cloudflare Workers AI**, or built-in **Transformers.js**.
- **Hybrid Storage**: Use local **LanceDB** for speed or **Cloudflare Vectorize** for cloud-synchronized embeddings.
- **Persistent Watchers**: Automated background indexing. Add a folder once, and VibeScout keeps it in sync forever.
- **Project-level Exclusions**: Support for `.vibeignore` and `.gitignore` to control exactly what gets indexed.
- **Local & Private**: Secure by design. By default, 100% of execution and data stays on your machine.

## 🛠 Installation

### Global Installation
```bash
npm install -g @sevenseconds/vibescout
```

## 💻 CLI Usage

VibeScout provides a powerful CLI for indexing, searching, and system maintenance.

### Web UI
Launch the interactive dashboard in your browser:
```bash
vibescout ui
```

### Interactive Search
Search your code with a beautiful terminal table:
```bash
vibescout search "how does the auth flow work?"
```

### Interactive Configuration
Visually manage providers, models, and paths:
```bash
vibescout config
```

### Indexing & Maintenance
```bash
# Index a project
vibescout index ./my-app "My Project"

# Cleanup stale files and optimize DB
vibescout compact
```

## 🤖 Supported Providers

| Provider | Type | Description |
| :--- | :--- | :--- |
| **Local** | Built-in | Transformers.js (BGE, MiniLM). No setup required. |
| **Ollama** | Local API | Offload to your local Ollama instance. |
| **LM Studio** | Local API | OpenAI-compatible local server preset. |
| **Bedrock** | Cloud | AWS Bedrock (Claude 3, Titan). Supports AWS Profiles. |
| **Gemini** | Cloud | Google Generative AI (1.5 Flash/Pro). |
| **Z.AI** | Cloud | BigModel.cn (GLM series) integration. |
| **OpenAI** | Cloud | Standard OpenAI API or compatible (DeepSeek, Groq). |
| **Cloudflare** | Cloud | Workers AI & Vectorize integration. |

## 🔌 Client Integration

### Claude Desktop / Gemini CLI
Add VibeScout to your configuration to give AI agents access to your code:

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

### Claude Code (CLI)
```bash
claude mcp add vibescout -- vibescout
```

## 📄 License
ISC License. See [LICENSE](LICENSE) for details.