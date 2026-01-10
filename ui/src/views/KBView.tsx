import { useState, useEffect } from 'react';
import { Database, FolderGit2, Layers, Plus, ExternalLink, Trash2, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Stats {
  collections: number;
  projects: number;
  status: string;
}

interface Watcher {
  folderPath: string;
  projectName: string;
  collection: string;
}

export default function KBView() {
  const [stats, setStats] = useState<Stats>({ collections: 0, projects: 0, status: 'idle' });
  const [kb, setKb] = useState<Record<string, string[]>>({});
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWatcher, setNewWatcher] = useState<Watcher>({ folderPath: '', projectName: '', collection: 'default' });

  const fetchData = async () => {
    try {
      const [statsRes, kbRes, watchersRes] = await Promise.all([
        axios.get('/api/stats'),
        axios.get('/api/kb'),
        axios.get('/api/watchers')
      ]);
      setStats(statsRes.data);
      setKb(kbRes.data);
      setWatchers(watchersRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddWatcher = async () => {
    if (!newWatcher.folderPath || !newWatcher.projectName) return;
    try {
      await axios.post('/api/watchers', newWatcher);
      setNewWatcher({ folderPath: '', projectName: '', collection: 'default' });
      setShowAddForm(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveWatcher = async (path: string) => {
    try {
      await axios.delete(`/api/watchers?folderPath=${encodeURIComponent(path)}`);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-8 space-y-8 h-full flex flex-col max-w-7xl mx-auto w-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Knowledge Base</h2>
          <p className="text-muted-foreground font-medium text-sm">Automated indexing and real-time monitoring for your codebases.</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-primary text-primary-foreground px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20"
        >
          {showAddForm ? <EyeOff size={20} /> : <Plus size={20} />}
          {showAddForm ? 'Cancel' : 'Watch New Project'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-card border-2 border-primary/20 p-8 rounded-3xl space-y-6 animate-in zoom-in-95 duration-200 shadow-xl shadow-primary/5">
          <h3 className="font-bold text-xl tracking-tight">Add Persistent Watcher</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Absolute Folder Path</label>
              <input 
                type="text" 
                placeholder="/Users/name/project"
                value={newWatcher.folderPath}
                onChange={(e) => setNewWatcher({...newWatcher, folderPath: e.target.value})}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Project Name</label>
              <input 
                type="text" 
                placeholder="My Awesome App"
                value={newWatcher.projectName}
                onChange={(e) => setNewWatcher({...newWatcher, projectName: e.target.value})}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Collection</label>
              <input 
                type="text" 
                placeholder="default"
                value={newWatcher.collection}
                onChange={(e) => setNewWatcher({...newWatcher, collection: e.target.value})}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button 
              onClick={handleAddWatcher}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg"
            >
              Start Watching & Indexing
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Collections" value={stats.collections} icon={Layers} color="blue" />
        <StatCard label="Total Projects" value={stats.projects} icon={FolderGit2} color="purple" />
        <StatCard label="System Status" value={stats.status} isStatus icon={ActivityIcon} color="green" />
      </div>

      {/* Watched Folders Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <Eye size={18} className="text-primary" />
          <h3 className="font-bold text-lg tracking-tight">Active Watchers</h3>
          <div className="h-px flex-1 bg-border/50 ml-2" />
        </div>
        
        {watchers.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {watchers.map((w) => (
              <div key={w.folderPath} className="bg-card border border-border p-4 rounded-2xl flex items-center justify-between group hover:border-primary/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="bg-secondary p-3 rounded-xl text-muted-foreground group-hover:text-primary transition-colors">
                    <FolderGit2 size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-base leading-tight">{w.projectName}</h4>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{w.folderPath}</p>
                  </div>
                  <div className="ml-4 px-2 py-0.5 rounded-md bg-secondary border border-border/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {w.collection}
                  </div>
                </div>
                <button 
                  onClick={() => handleRemoveWatcher(w.folderPath)}
                  className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Remove Watcher"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-secondary/20 border border-dashed border-border rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground font-medium">No persistent watchers configured yet.</p>
          </div>
        )}
      </div>

      <div className="space-y-6 pb-12">
        <div className="flex items-center gap-3 px-2">
          <Database size={18} className="text-primary" />
          <h3 className="font-bold text-lg tracking-tight">Searchable Index</h3>
          <div className="h-px flex-1 bg-border/50 ml-2" />
        </div>
        {Object.entries(kb).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(kb).map(([collection, projects]) => 
              projects.map(project => (
                <div key={`${collection}-${project}`} className="bg-card border border-border p-5 rounded-2xl hover:border-primary/40 transition-all group shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h4 className="font-bold text-lg group-hover:text-primary transition-colors">{project}</h4>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{collection}</p>
                    </div>
                    <div className="text-muted-foreground/30 group-hover:text-primary/50 transition-colors">
                      <Database size={24} />
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/50">
                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Ready</span>
                    <button className="text-xs font-bold text-primary flex items-center gap-1.5 hover:underline">
                      Explore <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : !loading && (
          <div className="bg-card border border-border rounded-3xl p-12 flex flex-col items-center justify-center space-y-4 shadow-inner min-h-[300px]">
            <div className="bg-secondary p-8 rounded-full text-muted-foreground/20 border border-border/50">
              <Database size={60} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold tracking-tight">Knowledge Base Empty</h3>
              <p className="text-muted-foreground max-w-xs font-medium text-sm">Index a project using the button above to start searching.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, isStatus }: { label: string, value: any, icon: any, color: string, isStatus?: boolean }) {
  const colorMap: any = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20"
  };

  return (
    <div className="bg-card border border-border p-6 rounded-3xl flex items-center justify-between shadow-sm">
      <div>
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">{label}</p>
        <p className={cn(
          "font-bold tracking-tighter",
          isStatus ? "text-2xl uppercase text-green-400" : "text-4xl"
        )}>{value}</p>
      </div>
      <div className={cn("p-4 rounded-2xl border", colorMap[color])}>
        <Icon size={28} />
      </div>
    </div>
  );
}

function ActivityIcon({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
