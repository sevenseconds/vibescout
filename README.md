# VibeScout: Local Code Intelligence & MCP Server

A high-performance Model Context Protocol (MCP) server and Web Dashboard for local semantic code search and AI-powered assistance. VibeScout transforms your codebase into a searchable, chat-ready knowledge base using local or cloud-based AI providers.

## 🚀 Features

- **Web Dashboard**: A modern React-based UI for visual searching, chatting with your code, and managing your knowledge base.
- **Proactive Indexing**: Connect folders directly from the browser with real-time indexing progress bars.
- **Separate LLM & Embedding Config**: Independently configure your embedding models (e.g., local BGE) and your chat LLMs (e.g., Claude 3.5 or GPT-4o).
- **Chat with Code (RAG)**: Ask natural language questions about your codebase. Features full **Markdown support** and **Syntax Highlighting** for code snippets.
- **Visual Dependency Graph**: Explore your codebase architecture visually. Includes a **Symbol Intelligence** panel showing exact exports and imports for every file.
- **IDE Integration**: "Open in Editor" buttons throughout the UI to jump directly from search results or the graph into your local IDE.
- **Multi-Language Support**: Robust semantic extraction for **TypeScript/JS**, **Python**, **Go**, **Java**, **Kotlin**, **Dart**, **Markdown**, **JSON**, **TOML**, and **XML**.
- **Multi-Provider AI**: Support for **Ollama**, **LM Studio**, **OpenAI**, **Google Gemini**, **AWS Bedrock**, **Z.AI (incl. Coding Plan)**, **Cloudflare Workers AI**, or built-in **Transformers.js**.
- **Hybrid Storage**: Use local **LanceDB** for speed or **Cloudflare Vectorize** for cloud-synchronized embeddings.
- **Persistent Watchers**: Automated background indexing dashboard. Manage active watchers and force syncs directly from the UI.
- **Project-level Exclusions**: Support for `.vibeignore` and `.gitignore` to control exactly what gets indexed.

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
Visually manage providers, models, and paths via CLI:
```bash
vibescout config
```

### Indexing & Maintenance
```bash
# Index a project manually
vibescout index ./my-app "My Project"

# Cleanup stale files and optimize DB
vibescout compact
```

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