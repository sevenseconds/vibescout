import { useState, useEffect } from 'react';
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
  Share2,
  Moon,
  Sun,
  Monitor,
  MessageSquare,
  Menu,
  X,
  Box
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
import PromptsView from './views/PromptsView';
import PluginManagerView from './views/PluginManagerView';
import PerformanceView from './views/PerformanceView';
import LiveLogs from './components/LiveLogs';
import NotificationTray from './components/NotificationTray';

type Theme = 'light' | 'dark' | 'system';

function AppContent() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('vibescout-theme') as Theme) || 'system';
  });

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (t: Theme) => {
      root.classList.remove('light', 'dark');

      if (t === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(t);
      }
    };

    applyTheme(theme);
    localStorage.setItem('vibescout-theme', theme);

    // Listen for system changes if set to system
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const [searchFilters, setSearchFilters] = useState<{ projectName?: string; collection?: string }>({});
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatPreFill, setChatPreFill] = useState<{ query?: string; projectName?: string; collection?: string; fileTypes?: string[]; category?: 'all' | 'code' | 'documentation' }>({});

  const handleExploreProject = (filters: { projectName?: string; collection?: string }) => {
    setSearchFilters(filters);
    navigate('/search');
  };

  const handleAskChat = (data: { query?: string; projectName?: string; collection?: string; fileTypes?: string[]; category?: 'all' | 'code' | 'documentation' }) => {
    setChatPreFill(data);
    navigate('/chat');
  };

  const mainNavItems = [
    { path: '/search', label: 'Search', icon: Search },
    { path: '/chat', label: 'Chat', icon: Sparkles },
    { path: '/graph', label: 'Graph', icon: Share2 },
    { path: '/kb', label: 'Knowledge Base', icon: Database },
    { path: '/prompts', label: 'Prompts', icon: MessageSquare },
  ];

  const secondaryNavItems = [
    { path: '/plugins', label: 'Plugins', icon: Box },
    { path: '/performance', label: 'Performance', icon: Activity },
    { path: '/config', label: 'Settings', icon: Settings },
  ];

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 border-r border-border bg-card flex flex-col shrink-0 z-50 transition-transform duration-300 transform lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
              <Activity size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight text-foreground">VibeScout</h1>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Code Intelligence</p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* Main Navigation */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">
              Core
            </p>
            {mainNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
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
          </div>

          {/* Secondary Navigation */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">
              System
            </p>
            {secondaryNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
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
          </div>
        </nav>

        <div className="p-4 mt-auto space-y-4 border-t border-border bg-secondary/30">
          <div className="flex items-center justify-between px-2 bg-secondary/50 p-1.5 rounded-xl border border-border/50">
            <button
              onClick={() => setTheme('light')}
              className={cn("p-2 rounded-lg transition-all", theme === 'light' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
              title="Light Mode"
            >
              <Sun size={16} />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={cn("p-2 rounded-lg transition-all", theme === 'dark' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
              title="Dark Mode"
            >
              <Moon size={16} />
            </button>
            <button
              onClick={() => setTheme('system')}
              className={cn("p-2 rounded-lg transition-all", theme === 'system' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
              title="System Mode"
            >
              <Monitor size={16} />
            </button>
          </div>
          <div className="flex items-center gap-3 px-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Local Server Active</p>
          </div>
        </div>
      </aside>

      <NotificationTray />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden h-16 border-b border-border bg-card flex items-center px-6 shrink-0 z-30 justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
              <Activity size={18} />
            </div>
            <span className="font-bold tracking-tight">VibeScout</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 bg-secondary rounded-xl text-foreground"
          >
            <Menu size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 min-w-0 font-sans">
          <Routes>
            <Route path="/" element={<Navigate to="/search" replace />} />
            <Route path="/search" element={
              <SearchView
                initialFilters={searchFilters}
                onFiltersClear={() => setSearchFilters({})}
                onAskChat={handleAskChat}
                initialResults={searchResults}
                initialQuery={searchQuery}
                onResultsChange={setSearchResults}
                onQueryChange={setSearchQuery}
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
            <Route path="/prompts" element={<PromptsView />} />
            <Route path="/plugins" element={<PluginManagerView />} />
            <Route path="/performance" element={<PerformanceView />} />
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
