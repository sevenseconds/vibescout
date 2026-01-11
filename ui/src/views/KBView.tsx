import { useState, useEffect } from 'react';
import { Database, FolderGit2, Layers, Plus, ExternalLink, Trash2, Eye, EyeOff, RefreshCw, Loader2, Info, Folder } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import FolderPicker from '../components/FolderPicker';

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

interface IndexProgress {
  active: boolean;
  projectName: string;
  totalFiles: number;
  processedFiles: number;
  status: string;
}

interface KBViewProps {
  onExplore?: (filters: { projectName?: string; collection?: string }) => void;
}

export default function KBView({ onExplore }: KBViewProps) {
  const [stats, setStats] = useState<Stats>({ collections: 0, projects: 0, status: 'idle' });
  const [kb, setKb] = useState<Record<string, string[]>>({});
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingWatcher, setRemovingWatcher] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWatcher, setNewWatcher] = useState<Watcher>({ folderPath: '', projectName: '', collection: 'default' });
  
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [summarize, setSummarize] = useState(true);

  const fetchData = async () => {
    try {
      const [statsRes, kbRes, watchersRes, progressRes] = await Promise.all([
        axios.get('/api/stats'),
        axios.get('/api/kb'),
        axios.get('/api/watchers'),
        axios.get('/api/index/status')
      ]);
      setStats(statsRes.data);
      setKb(kbRes.data);
      setWatchers(watchersRes.data);
      setIndexProgress(progressRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll progress if active
    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/api/index/status');
        setIndexProgress(res.data);
        if (!res.data.active && indexProgress?.active) {
          // If just finished, refresh KB
          fetchData();
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [indexProgress?.active]);

  const handleAddWatcher = async () => {
    if (!newWatcher.folderPath || !newWatcher.projectName) return;
    try {
      await axios.post('/api/watchers', newWatcher);
      // Also trigger initial index
      await axios.post('/api/index', { ...newWatcher, summarize });
      setNewWatcher({ folderPath: '', projectName: '', collection: 'default' });
      setShowAddForm(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleBrowseFolder = () => {
    setShowFolderPicker(true);
  };

  const onSelectFolder = (path: string) => {
    const projectName = newWatcher.projectName || path.split(/[\\/]/).pop() || '';
    setNewWatcher(prev => ({ ...prev, folderPath: path, projectName }));
    setShowFolderPicker(false);
  };

  const handleRemoveWatcher = async (path: string, projectName?: string) => {
    setRemovingWatcher(path);
    try {
      await axios.delete(`/api/watchers?folderPath=${encodeURIComponent(path)}${projectName ? `&projectName=${encodeURIComponent(projectName)}` : ''}`);
      setWatchers(prev => prev.filter(w => w.folderPath !== path));
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingWatcher(null);
    }
  };

  const handleDeleteProject = async (projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}" from the index? This cannot be undone.`)) return;
    try {
      setKb(prev => {
        const next = { ...prev };
        for (const col in next) {
          next[col] = next[col].filter(p => p !== projectName);
          if (next[col].length === 0) delete next[col];
        }
        return next;
      });

      const watcher = watchers.find(w => w.projectName === projectName);
      if (watcher) {
        setWatchers(prev => prev.filter(w => w.projectName !== projectName));
        await axios.delete(`/api/watchers?folderPath=${encodeURIComponent(watcher.folderPath)}&projectName=${encodeURIComponent(watcher.projectName)}`);
      }

      await axios.delete(`/api/projects?projectName=${encodeURIComponent(projectName)}`);
      await fetchData();
    } catch (err) {
      console.error(err);
      fetchData();
    }
  };

  const handleReindex = async (w: Watcher) => {
    try {
      await axios.post('/api/index', { ...w, summarize });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEnableWatch = async (projectName: string, collection: string) => {
    try {
      const pathRes = await axios.get(`/api/projects/root?projectName=${encodeURIComponent(projectName)}`);
      const folderPath = pathRes.data.rootPath;
      
      if (confirm(`Detected root path: ${folderPath}\n\nDo you want to start a real-time watcher for this project?`)) {
        await axios.post('/api/watchers', { folderPath, projectName, collection });
        fetchData();
      }
    } catch (err) {
      console.error('Failed to enable watch:', err);
      alert("Could not automatically detect project path. Please use 'Connect Folder' manually.");
    }
  };

  return (
    <div className="p-8 space-y-8 h-full flex flex-col max-w-7xl mx-auto w-full overflow-y-auto pb-20">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Knowledge Base</h2>
          <p className="text-muted-foreground font-medium text-sm">Automated indexing and real-time monitoring for your codebases.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchData}
            className="p-2.5 rounded-2xl bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
            title="Refresh Status"
          >
            <RefreshCw size={20} className={cn(loading && "animate-spin")} />
          </button>
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            {showAddForm ? <EyeOff size={20} /> : <Plus size={20} />}
            {showAddForm ? 'Cancel' : 'Connect Folder'}
          </button>
        </div>
      </div>

      {/* Indexing Progress Bar */}
      {indexProgress?.active && (
        <div className="bg-primary/5 border border-primary/20 p-6 rounded-3xl space-y-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin text-primary" size={20} />
              <div>
                <h3 className="font-bold text-sm">Indexing "{indexProgress.projectName}"</h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Background Task Active</p>
              </div>
            </div>
            <span className="text-sm font-mono font-bold">
              {indexProgress.processedFiles} / {indexProgress.totalFiles} files
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-3 overflow-hidden border border-border/50">
            <div 
              className="bg-primary h-full transition-all duration-500 ease-out"
              style={{ width: `${(indexProgress.processedFiles / indexProgress.totalFiles) * 100}%` }}
            />
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-card border-2 border-primary/20 p-8 rounded-3xl space-y-6 animate-in zoom-in-95 duration-200 shadow-xl shadow-primary/5">
          <div className="flex items-center gap-3">
            <FolderGit2 className="text-primary" size={24} />
            <h3 className="font-bold text-xl tracking-tight">Connect Local Project</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Absolute Folder Path</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="/Users/name/workspaces/my-app"
                  value={newWatcher.folderPath}
                  onChange={(e) => setNewWatcher({...newWatcher, folderPath: e.target.value})}
                  className="flex-1 bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium text-sm transition-all"
                />
                <button 
                  onClick={handleBrowseFolder}
                  className="px-4 bg-secondary border border-border rounded-xl hover:border-primary/50 transition-all text-muted-foreground hover:text-primary"
                  title="Browse Folders"
                >
                  <Folder size={20} />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Project Name (Identifier)</label>
              <input 
                type="text" 
                placeholder="my-app"
                value={newWatcher.projectName}
                onChange={(e) => setNewWatcher({...newWatcher, projectName: e.target.value})}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium text-sm transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Collection (Group)</label>
              <input 
                type="text" 
                placeholder="default"
                value={newWatcher.collection}
                onChange={(e) => setNewWatcher({...newWatcher, collection: e.target.value})}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium text-sm transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 px-1">
            <button 
              onClick={() => setSummarize(!summarize)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-xs transition-all",
                summarize ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"
              )}
            >
              {summarize ? <Plus size={14} className="rotate-45" /> : <Plus size={14} />}
              AI Summarization {summarize ? "Enabled" : "Disabled"}
            </button>
            <p className="text-[10px] text-muted-foreground font-medium">Use Hierarchical Context for higher search accuracy (slower).</p>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info size={14} />
              <p className="text-[10px] font-bold uppercase tracking-wider">Note: This will add a persistent watcher and start initial indexing.</p>
            </div>
            <button 
              onClick={handleAddWatcher}
              disabled={!newWatcher.folderPath || !newWatcher.projectName}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg disabled:opacity-50"
            >
              Start Watching & Indexing
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Collections" value={stats.collections} icon={Layers} color="blue" />
        <StatCard label="Total Projects" value={stats.projects} icon={FolderGit2} color="purple" />
        <StatCard label="System Status" value={indexProgress?.active ? "Indexing" : stats.status} isStatus active={indexProgress?.active} icon={ActivityIcon} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Watched Folders Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <Eye size={18} className="text-primary" />
              <h3 className="font-bold text-lg tracking-tight">Active Watchers</h3>
            </div>
            {watchers.length > 0 && (
              <button 
                onClick={async () => {
                  if (confirm("Stop ALL active watchers?")) {
                    await axios.delete('/api/watchers/all');
                    fetchData();
                  }
                }}
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-red-400 transition-colors"
              >
                Stop All
              </button>
            )}
          </div>
          
          {watchers.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {watchers.map((w) => (
                <div key={w.folderPath} className={cn(
                  "bg-card border border-border p-4 rounded-2xl flex items-center justify-between group hover:border-primary/30 transition-all shadow-sm",
                  removingWatcher === w.folderPath && "opacity-50 grayscale pointer-events-none"
                )}>
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="bg-secondary p-3 rounded-xl text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                      <FolderGit2 size={20} />
                    </div>
                    <div className="truncate">
                      <h4 className="font-bold text-base leading-tight truncate">{w.projectName}</h4>
                      <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{w.folderPath}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 transition-all shrink-0">
                    <button 
                      onClick={() => handleReindex(w)}
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all hover:scale-110 active:scale-90"
                      title="Force Re-index"
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button 
                      onClick={() => handleRemoveWatcher(w.folderPath, w.projectName)}
                      className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all hover:scale-110 active:scale-90"
                      title="Stop Watching"
                    >
                      {removingWatcher === w.folderPath ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-secondary/20 border border-dashed border-border rounded-2xl p-12 text-center">
              <p className="text-sm text-muted-foreground font-medium italic">No folders are being watched.</p>
            </div>
          )}
        </div>

        {/* Index List Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <Database size={18} className="text-primary" />
            <h3 className="font-bold text-lg tracking-tight">Indexed Projects</h3>
            <div className="h-px flex-1 bg-border/50 ml-2" />
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            {Object.entries(kb).map(([collection, projects]) => 
              projects.map(project => {
                const isWatched = watchers.some(w => w.projectName === project);
                return (
                  <div key={`${collection}-${project}`} className="bg-card border border-border p-4 rounded-2xl flex items-center justify-between group hover:border-primary/30 transition-all shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/10 p-3 rounded-xl text-primary shrink-0">
                        <Database size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-base leading-tight">{project}</h4>
                          {isWatched && (
                            <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              <Eye size={8} /> Watching
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-0.5">{collection}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 transition-all shrink-0">
                      {!isWatched && (
                        <button 
                          onClick={() => handleEnableWatch(project, collection)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 rounded-xl transition-all hover:scale-105 active:scale-90"
                          title="Enable Live Sync"
                        >
                          <Eye size={14} /> Live Sync
                        </button>
                      )}
                      <button 
                        onClick={() => onExplore?.({ projectName: project, collection })}
                        className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all hover:scale-110 active:scale-90"
                        title="Explore in Search"
                      >
                        <ExternalLink size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteProject(project)}
                        className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all hover:scale-110 active:scale-90"
                        title="Delete Project Index"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            {Object.keys(kb).length === 0 && !loading && (
              <div className="bg-secondary/20 border border-dashed border-border rounded-2xl p-12 text-center">
                <p className="text-sm text-muted-foreground font-medium italic">Database is empty.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <FolderPicker 
        isOpen={showFolderPicker} 
        onClose={() => setShowFolderPicker(false)} 
        onSelect={onSelectFolder} 
      />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, isStatus, active }: { label: string, value: any, icon: any, color: string, isStatus?: boolean, active?: boolean }) {
  const colorMap: any = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20"
  };

  return (
    <div className="bg-card border border-border p-6 rounded-3xl flex items-center justify-between shadow-sm relative overflow-hidden group">
      {active && <div className="absolute inset-0 bg-primary/5 animate-pulse" />}
      <div className="relative z-10">
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <p className={cn(
            "font-bold tracking-tighter",
            isStatus ? "text-xl uppercase" : "text-4xl",
            isStatus && (active ? "text-primary animate-pulse" : "text-green-400")
          )}>{value}</p>
          {active && <Loader2 size={16} className="animate-spin text-primary" />}
        </div>
      </div>
      <div className={cn("p-4 rounded-2xl border relative z-10 transition-transform group-hover:scale-110 duration-300", colorMap[color])}>
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