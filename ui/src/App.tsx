import { useState } from 'react';
import { 
  Search, 
  Database, 
  Settings, 
  Activity,
  Sparkles,
  Share2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Components
import SearchView from './views/SearchView';
import KBView from './views/KBView';
import ConfigView from './views/ConfigView';
import ChatView from './views/ChatView';
import GraphView from './views/GraphView';
import LiveLogs from './components/LiveLogs';

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'kb' | 'config' | 'chat' | 'graph'>('search');
  const [searchFilters, setSearchFilters] = useState<{ projectName?: string; collection?: string }>({});
  const [chatPreFill, setChatPreFill] = useState<{ query?: string; projectName?: string; collection?: string; fileTypes?: string[] }>({});

  const navigateToSearch = (filters: { projectName?: string; collection?: string }) => {
    setSearchFilters(filters);
    setActiveTab('search');
  };

  const navigateToChat = (data: { query?: string; projectName?: string; collection?: string; fileTypes?: string[] }) => {
    setChatPreFill(data);
    setActiveTab('chat');
  };

  const navItems = [
    { id: 'search', label: 'Search', icon: Search },
    { id: 'chat', label: 'Chat', icon: Sparkles },
    { id: 'graph', label: 'Graph', icon: Share2 },
    { id: 'kb', label: 'Knowledge Base', icon: Database },
    { id: 'config', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-border">
          <div className="bg-primary p-2 rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
            <Activity size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight text-foreground">VibeScout</h1>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Code Intelligence</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group text-sm font-bold",
                activeTab === item.id 
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon size={20} className={cn(activeTab === item.id ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-border bg-secondary/30">
          <div className="flex items-center gap-3 px-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Local Server Active</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
        <div className="h-full w-full">
          {activeTab === 'search' && (
            <SearchView 
              initialFilters={searchFilters} 
              onFiltersClear={() => setSearchFilters({})} 
              onAskChat={navigateToChat}
            />
          )}
          {activeTab === 'chat' && (
            <ChatView 
              preFill={chatPreFill} 
              onPreFillClear={() => setChatPreFill({})} 
            />
          )}
          {activeTab === 'graph' && <GraphView />}
          {activeTab === 'kb' && <KBView onExplore={navigateToSearch} />}
          {activeTab === 'config' && <ConfigView />}
        </div>
        <LiveLogs />
      </main>
    </div>
  );
}