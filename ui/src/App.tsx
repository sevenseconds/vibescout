import { useState } from 'react';
import { 
  Search, 
  Database, 
  Settings, 
  Activity
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'kb' | 'config'>('search');

  const navItems = [
    { id: 'search', label: 'Search', icon: Search },
    { id: 'kb', label: 'Knowledge Base', icon: Database },
    { id: 'config', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-border">
          <div className="bg-primary p-2 rounded-lg text-primary-foreground">
            <Activity size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight">VibeScout</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Local Code Intelligence</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group text-sm font-medium",
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
            <p className="text-xs font-semibold text-muted-foreground">Server Active</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
        <div className="h-full w-full">
          {activeTab === 'search' && <SearchView />}
          {activeTab === 'kb' && <KBView />}
          {activeTab === 'config' && <ConfigView />}
        </div>
      </main>
    </div>
  );
}