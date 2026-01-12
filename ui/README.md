# VibeScout Web UI

React + TypeScript + Vite frontend for the VibeScout code intelligence platform.

## Development

```bash
# Install dependencies
npm install

# Start Vite dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

## Architecture

### Tech Stack
- **React 18** - UI framework with hooks
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first styling
- **Axios** - HTTP client for API calls
- **Lucide React** - Icon library

### Project Structure

```
ui/src/
├── components/          # Reusable UI components
│   ├── DebugPanel.tsx   # AI request/response inspector
│   ├── FolderPicker.tsx # Directory browser
│   ├── LiveLogs.tsx     # Real-time server logs
│   ├── NotificationTray.tsx  # Toast notifications
│   └── PromptEditor.tsx # Code editor for prompts
├── views/               # Page-level components
│   ├── SearchView.tsx   # Semantic search
│   ├── ChatView.tsx     # AI chat interface
│   ├── GraphView.tsx    # Dependency visualization
│   ├── KBView.tsx       # Knowledge base management
│   ├── ConfigView.tsx   # Settings configuration
│   └── PromptsView.tsx  # Prompt template management
├── utils/
│   └── events.ts        # Event bus for notifications
├── App.tsx              # Root component with router
└── main.tsx             # Application entry point
```

## Key Features

### Notification System

The UI uses a centralized notification system instead of browser `alert()` dialogs.

**Usage:**
```typescript
import { notify } from '../utils/events';

// Success notification (auto-hides after 5 seconds)
notify('success', 'Project indexed successfully');

// Error notification (persists until dismissed)
notify('error', 'Failed to connect to Ollama');
```

**Component:** `NotificationTray.tsx` displays notifications as toast messages in the top-right corner with:
- Green background + checkmark icon for success
- Red background + alert icon for errors
- Auto-hide after 5 seconds for success messages
- Manual dismiss via X button
- Animated slide-in from right

### Views

| View | Route | Description |
|------|-------|-------------|
| Search | `/search` | Semantic code search with filters and results |
| Chat | `/chat` | AI-powered chat with RAG context |
| Graph | `/graph` | Interactive dependency graph visualization |
| Knowledge Base | `/kb` | Manage indexed projects and collections |
| Settings | `/config` | Configure providers, models, and system preferences |
| Prompts | `/prompts` | Customize AI prompt templates |

### Components

**NotificationTray** (`components/NotificationTray.tsx`)
- Displays success/error notifications
- Polls `/api/index/status` for indexing completion
- Subscribes to manual notifications via event bus
- Fixed position: top-right corner (z-index: 100)

**LiveLogs** (`components/LiveLogs.tsx`)
- Real-time server log streaming
- Collapsible panel at bottom-right
- Auto-scrolls to latest entries

**DebugPanel** (`components/DebugPanel.tsx`)
- Inspect AI request/response pairs
- Available in Settings and Prompts views
- Shows embedding and LLM API calls

**PromptEditor** (`components/PromptEditor.tsx`)
- CodeMirror-based text editor
- Syntax highlighting for prompt templates
- Test summarization integration

## API Integration

All API calls use `axios` with base URL from environment:

```typescript
// Example: Search code
const response = await axios.post('/api/search', {
  query: 'authentication',
  projectName: 'my-project',
  limit: 10
});
```

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | POST | Semantic code search |
| `/api/chat` | POST | AI chat with streaming |
| `/api/graph` | GET | Dependency graph data |
| `/api/config` | GET/POST | Configuration management |
| `/api/index/status` | GET | Indexing progress |
| `/api/test/embedding` | POST | Test embedding provider |
| `/api/test/llm` | POST | Test LLM provider |

## Styling

Uses Tailwind CSS with custom design tokens:
- Primary: Vibrant accent color for CTAs
- Secondary: Muted backgrounds
- Card: Elevated surfaces
- Border: Subtle dividers
- Muted Foreground: Secondary text

Theme support: Light, Dark, System (auto)

## State Management

- React hooks (`useState`, `useEffect`) for local state
- React Router for navigation state
- Event bus (`utils/events.ts`) for cross-component notifications

## Build Process

Production builds are output to `../src/ui-dist/` for serving by the Node.js backend:
```bash
npm run build  # Outputs to ../src/ui-dist/
```
