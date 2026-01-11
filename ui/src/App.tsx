import { useState } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  NavLink, 
  useNavigate,
  Navigate
} from 'react-router-dom';
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
import NotificationTray from './components/NotificationTray';

function AppContent() {
  const navigate = useNavigate();
  const [searchFilters, setSearchFilters] = useState<{ projectName?: string; collection?: string }>({});
  const [chatPreFill, setChatPreFill] = useState<{ query?: string; projectName?: string; collection?: string; fileTypes?: string[] }>({});

  const handleExploreProject = (filters: { projectName?: string; collection?: string }) => {
    setSearchFilters(filters);
    navigate('/search');
  };

  const handleAskChat = (data: { query?: string; projectName?: string; collection?: string; fileTypes?: string[] }) => {
    setChatPreFill(data);
    navigate('/chat');
  };

  const navItems = [
    { path: '/search', label: 'Search', icon: Search },
    { path: '/chat', label: 'Chat', icon: Sparkles },
    { path: '/graph', label: 'Graph', icon: Share2 },
    { path: '/kb', label: 'Knowledge Base', icon: Database },
    { path: '/config', label: 'Settings', icon: Settings },
  ];

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
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group text-sm font-bold",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} className={cn(isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-border bg-secondary/30">
          <div className="flex items-center gap-3 px-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Local Server Active</p>
          </div>
        </div>
      </aside>

      <NotificationTray />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        <div className="flex-1 overflow-auto w-full">
          <Routes>
            <Route path="/" element={<Navigate to="/search" replace />} />
            <Route path="/search" element={
              <SearchView 
                initialFilters={searchFilters} 
                onFiltersClear={() => setSearchFilters({})} 
                onAskChat={handleAskChat}
              />
            } />
            <Route path="/chat" element={
              <ChatView 
                preFill={chatPreFill} 
                onPreFillClear={() => setChatPreFill({})} 
              />
            } />
            <Route path="/graph" element={<GraphView />} />
            <Route path="/kb" element={<KBView onExplore={handleExploreProject} />} />
            <Route path="/config" element={<ConfigView />} />
          </Routes>
        </div>
        <LiveLogs />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
