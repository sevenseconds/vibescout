import { useState, useEffect } from 'react';
import { FolderGit2, Layers, Plus, ExternalLink, Trash2, Eye, EyeOff, RefreshCw, Loader2, Info, Pause, Play, AlertCircle, X, ChevronDown, Check, XCircle, Clock, Bug, Zap, Wand2 } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import DebugPanel from '../components/DebugPanel';
import PromptEditor from '../components/PromptEditor';
import { notify } from '../utils/events';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Stats {
  collections: number;
  projects: number;
  status: string;
}

interface Watcher {
  folderpath: string;
  projectname: string;
  collection: string;
}

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  variant?: 'primary' | 'danger';
  onConfirm: () => void;
}

interface Config {
  summarize?: boolean;
}

interface IndexProgress {
  active: boolean;
  projectName: string;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  lastError: string | null;
  status: string;
  currentFiles: string[];
  completedFiles: Array<{ file: string; status: string; blocks?: number; error?: string }>;
  skippedFiles: number;
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWatcher, setNewWatcher] = useState<Watcher>({ folderpath: '', projectname: '', collection: 'default' });
  const [config, setConfig] = useState<Config>({ summarize: true });

  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [summarize, setSummarize] = useState(true);
  const [showIndexDetails, setShowIndexDetails] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Test Modal State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testPrompt, setTestPrompt] = useState('');
  const [testTarget, setTestTarget] = useState<'code' | 'docs'>('code');
  const [testResult, setTestResult] = useState<{ file: string; summary: string; content: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [configPrompts, setConfigPrompts] = useState<any>(null);

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const fetchData = async () => {
    try {
      // Use individual try-catch or Promise.allSettled to be more resilient
      const [statsRes, kbRes, watchersRes, progressRes, configRes] = await Promise.allSettled([
        axios.get('/api/stats'),
        axios.get('/api/kb'),
        axios.get('/api/watchers'),
        axios.get('/api/index/status'),
        axios.get('/api/config')
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (kbRes.status === 'fulfilled') setKb(kbRes.value.data);
      if (watchersRes.status === 'fulfilled') setWatchers(watchersRes.value.data);
      if (progressRes.status === 'fulfilled') setIndexProgress(progressRes.value.data);

      if (configRes.status === 'fulfilled') {
        const loadedConfig = configRes.value.data;
        setConfig(loadedConfig);
        setSummarize(loadedConfig.summarize ?? true);
      }

      // Log errors for failed requests
      [statsRes, kbRes, watchersRes, progressRes, configRes].forEach((res, i) => {
        if (res.status === 'rejected') {
          console.error(`Request ${i} failed:`, res.reason);
        }
      });
    } catch (err) {
      console.error('fetchData critical error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll progress every 2 seconds
    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/api/index/status');
        const newIndexProgress = res.data;

        setIndexProgress(prev => {
          // Check if indexing just finished (was active, now not)
          const justFinished = prev?.active && !newIndexProgress.active && newIndexProgress.status !== 'idle';
          if (justFinished) {
            // Refresh data after indexing completes
            setTimeout(() => fetchData(), 500);
          }
          return newIndexProgress;
        });
      } catch (err) {
        console.error('Failed to fetch index progress:', err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []); // Empty dependency array - only run once on mount

  const handleAddWatcher = async () => {
    if (!newWatcher.folderpath || !newWatcher.projectname) return;
    try {
      // API expects camelCase for inputs based on server definition, but let's check
      // Server expects: folderPath, projectName, collection
      await axios.post('/api/watchers', { folderPath: newWatcher.folderpath, projectName: newWatcher.projectname, collection: newWatcher.collection });
      // also trigger initial index
      await axios.post('/api/index', { folderPath: newWatcher.folderpath, projectName: newWatcher.projectname, collection: newWatcher.collection, summarize });
      setNewWatcher({ folderpath: '', projectname: '', collection: 'default' });
      setShowAddForm(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveWatcher = async (path: string, projectName?: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Stop Live Sync',
      message: `Are you sure you want to stop live sync for "${projectName || path}"?`,
      confirmText: 'Stop Sync',
      variant: 'danger',
      onConfirm: async () => {
        setRemovingWatcher(path);
        try {
          await axios.delete(`/api/watchers?folderPath=${encodeURIComponent(path)}${projectName ? `&projectName=${encodeURIComponent(projectName)}` : ''}`);
          setWatchers(prev => prev.filter(w => w.folderpath !== path));
          await fetchData();
        } catch (err) {
          console.error(err);
        } finally {
          setRemovingWatcher(null);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handlePause = async () => {
    await axios.post('/api/index/pause');
    fetchData();
  };

  const handleResume = async () => {
    await axios.post('/api/index/resume');
    fetchData();
  };

  const handleRetry = async () => {
    await axios.post('/api/index/retry');
    fetchData();
  };

  const handleDeleteProject = async (projectName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Project Index',
      message: `Are you sure you want to delete "${projectName}" from the index? This cannot be undone.`,
      confirmText: 'Delete Index',
      variant: 'danger',
      onConfirm: async () => {
        try {
          // 1. Find if this project has a watcher and remove it first
          // Use lowercase projectname here to match the interface
          const watcher = watchers.find(w => w.projectname === projectName);
          if (watcher) {
            await axios.delete(`/api/watchers?folderPath=${encodeURIComponent(watcher.folderpath)}&projectName=${encodeURIComponent(watcher.projectname)}`);
          }

          // 2. Delete the project index
          await axios.delete(`/api/projects?projectName=${encodeURIComponent(projectName)}`);

          // 3. Ensure final sync
          await fetchData();
        } catch (err) {
          console.error(err);
          fetchData(); // Rollback on error
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleReindex = async (w: Watcher) => {
    setConfirmModal({
      isOpen: true,
      title: 'Force Re-index',
      message: `Force a full re-index of "${w.projectname}"? This will clear its current index and re-scan every file.`,
      confirmText: 'Start Re-index',
      variant: 'primary',
      onConfirm: async () => {
        try {
          // Server expects camelCase
          await axios.post('/api/index', { folderPath: w.folderpath, projectName: w.projectname, collection: w.collection, summarize, force: true });
          fetchData();
        } catch (err) {
          console.error(err);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

    const handleEnableWatch = async (projectName: string, collection: string) => {
      try {
        // 1. Get the likely root path from the server
        const pathRes = await axios.get(`/api/projects/root?projectName=${encodeURIComponent(projectName)}`);
        const folderPath = pathRes.data.rootPath;
        
        // 2. Pre-fill the form and scroll to top, or just do it directly
        if (confirm(`Detected root path: ${folderPath}\n\nDo you want to start a real-time watcher for this project?`)) {
          await axios.post('/api/watchers', { folderPath, projectName, collection });
          fetchData();
        }
      } catch (err) {
        console.error('Failed to enable watch:', err);
        notify('error', "Could not automatically detect project path. Please use 'Add Project' manually.");
      }
    };
  
    const openTestModal = async () => {
      setTesting(true); // Show loading state on button or just wait
      try {
        const configRes = await axios.get('/api/config');
        const prompts = configRes.data.prompts;
        setConfigPrompts(prompts);
        
        const activeId = prompts?.activeSummarizeId || 'default';
        const template = prompts?.summarizeTemplates?.find((t: any) => t.id === activeId);
        setTestPrompt(template?.text || "Summarize this code:\n\n{{code}}");
        setShowTestModal(true);
      } catch (err) {
        console.error('Failed to load prompts for test:', err);
        // Fallback to default
        setTestPrompt("Summarize this code:\n\n{{code}}");
        setShowTestModal(true);
      } finally {
        setTesting(false);
      }
    };
  
    const handleTestSummarization = async () => {
      console.log('handleTestSummarization called', newWatcher);
      if (!newWatcher.folderpath) {
        notify('error', "Please enter a folder path first.");
        return;
      }
      setTesting(true);
      setTestResult(null);
      try {
        console.log('Sending request to /api/test/summarize-file');
        const res = await axios.post('/api/test/summarize-file', {
          folderPath: newWatcher.folderpath,
          type: testTarget,
          customPrompt: testPrompt || undefined
        });
        console.log('Response:', res.data);
        setTestResult(res.data);
      } catch (err: any) {
        console.error('Test error:', err);
        notify('error', err.response?.data?.error || "Test failed. Check if folder path is correct.");
      } finally {
        setTesting(false);
      }
    };
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8 space-y-8 flex flex-col max-w-7xl mx-auto w-full pb-20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Knowledge Base</h2>
              <p className="text-muted-foreground font-medium text-sm">Automated indexing and real-time monitoring for your codebases.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className={cn(
                  "p-2.5 rounded-2xl border transition-all",
                  showDebug
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
                title="Inspect AI Requests"
              >
                <Bug size={20} />
              </button>
              <button
                onClick={fetchData}
                className="p-2.5 rounded-2xl bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
                title="Refresh Status"
              >
                <RefreshCw size={20} className={cn(loading && "animate-spin")}
                />
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-primary text-primary-foreground px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20"
              >
                {showAddForm ? <EyeOff size={20} /> : <Plus size={20} />}
                {showAddForm ? 'Cancel' : 'Add Project'}
              </button>
            </div>
          </div>

          {/* Indexing Progress Bar */}
          {(indexProgress?.active || indexProgress?.status === 'paused' || indexProgress?.status === 'completed_with_errors') && (
            <div className={cn(
              "bg-primary/5 border border-primary/20 p-6 rounded-3xl space-y-4 animate-in slide-in-from-top-4 duration-300",
              indexProgress?.status === 'paused' && "bg-amber-500/5 border-amber-500/20",
              indexProgress?.status === 'completed_with_errors' && "bg-red-500/5 border-red-500/20"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {indexProgress?.status === 'paused' ? (
                    <Pause className="text-amber-500" size={20} />
                  ) : indexProgress?.status === 'completed_with_errors' ? (
                    <AlertCircle className="text-red-500" size={20} />
                  ) : (
                    <Loader2 className="animate-spin text-primary" size={20} />
                  )}
                  <div>
                    <h3 className="font-bold text-sm">
                      {indexProgress?.status === 'paused' ? 'Indexing Paused' :
                        indexProgress?.status === 'completed_with_errors' ? 'Indexing Finished with Errors' :
                          `Indexing "${indexProgress?.projectName}"`}
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
                      {indexProgress?.status === 'paused' ? 'Queue on hold' :
                        indexProgress?.status === 'completed_with_errors' ? `${indexProgress?.failedFiles} files failed` :
                          'Background Task Active'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {indexProgress?.active && (
                    <button
                      onClick={indexProgress?.status === 'paused' ? handleResume : handlePause}
                      className={cn(
                        "p-2 rounded-xl transition-all shadow-lg active:scale-95",
                        indexProgress?.status === 'paused'
                          ? "bg-amber-500 text-white shadow-amber-500/20"
                          : "bg-secondary text-foreground border border-border"
                      )}
                      title={indexProgress?.status === 'paused' ? 'Resume Indexing' : 'Pause Indexing'}
                    >
                      {indexProgress?.status === 'paused' ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
                    </button>
                  )}
                  {indexProgress?.status === 'completed_with_errors' && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleRetry}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-xl font-bold text-xs hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                        title="Retry Failed Files"
                      >
                        <RefreshCw size={14} /> Retry
                      </button>
                      <button
                        onClick={() => setIndexProgress(null)}
                        className="p-2 hover:bg-red-500/10 rounded-xl text-red-500 transition-colors"
                        title="Dismiss"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <span className="text-sm font-mono font-bold">
                    {indexProgress?.processedFiles} / {indexProgress?.totalFiles} files
                  </span>
                </div>
              </div>

              {indexProgress?.lastError && indexProgress?.status === 'completed_with_errors' && (
                <p className="text-[10px] font-mono text-red-400/80 bg-red-500/5 p-2 rounded-lg border border-red-500/10 truncate">
                  Last Error: {indexProgress.lastError}
                </p>
              )}

              <div className="w-full bg-secondary rounded-full h-3 overflow-hidden border border-border/50">
                <div
                  className={cn(
                    "h-full transition-all duration-500 ease-out",
                    indexProgress?.status === 'paused' ? "bg-amber-500" :
                      indexProgress?.status === 'completed_with_errors' ? "bg-red-500" : "bg-primary"
                  )}
                  style={{ width: `${((indexProgress?.processedFiles || 0) / (indexProgress?.totalFiles || 1)) * 100}%` }}
                />
              </div>

              {/* Collapsible Details */}
              <button
                onClick={() => setShowIndexDetails(!showIndexDetails)}
                className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors w-full justify-between mt-2"
              >
                <span>
                  {showIndexDetails ? 'Hide' : 'Show'} File Details
                  {indexProgress?.currentFiles?.length > 0 && ` (${indexProgress.currentFiles.length} processing)`}
                </span>
                <ChevronDown size={16} className={cn("transition-transform", showIndexDetails && "rotate-180")} />
              </button>

              {showIndexDetails && (
                <div className="space-y-4 pt-4 border-t border-border/50 animate-in slide-in-from-top-2 duration-200">
                  {/* Currently Processing */}
                  {indexProgress?.currentFiles && indexProgress.currentFiles.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin" />
                        Currently Processing ({indexProgress.currentFiles.length})
                      </h4>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {indexProgress.currentFiles.map((file, i) => (
                          <div key={i} className="text-[10px] font-mono text-muted-foreground bg-secondary/30 p-2 rounded border border-border/30 truncate flex items-center gap-2">
                            <Clock size={10} className="text-blue-400 shrink-0" />
                            {file}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recently Completed */}
                  {indexProgress?.completedFiles && indexProgress.completedFiles.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                        Recently Completed ({indexProgress.completedFiles.length})
                      </h4>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {indexProgress.completedFiles.map((item, i) => (
                          <div key={i} className={cn(
                            "text-[10px] font-mono p-2 rounded border flex items-center gap-2",
                            item.status === 'completed' && "text-green-400 bg-green-500/5 border-green-500/20",
                            item.status === 'skipped' && "text-muted-foreground bg-secondary/30 border-border/30",
                            item.status === 'failed' && "text-red-400 bg-red-500/5 border-red-500/20"
                          )}>
                            {item.status === 'completed' && <Check size={10} className="shrink-0" />}
                            {item.status === 'skipped' && <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0" />}
                            {item.status === 'failed' && <XCircle size={10} className="shrink-0" />}
                            <span className="truncate flex-1">{item.file}</span>
                            {item.blocks !== undefined && (
                              <span className="text-[9px] bg-green-500/10 px-1.5 py-0.5 rounded shrink-0">
                                {item.blocks} blocks
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stats Summary */}
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/50">
                    <div className="text-center">
                      <div className="text-xl font-bold text-foreground">{indexProgress?.processedFiles - (indexProgress?.skippedFiles || 0) - (indexProgress?.failedFiles || 0)}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-black">Indexed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-muted-foreground">{indexProgress?.skippedFiles || 0}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-black">Skipped</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-red-400">{indexProgress?.failedFiles || 0}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-black">Failed</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {showAddForm && (
            <div className="bg-card border-2 border-primary/20 p-8 rounded-3xl space-y-6 animate-in zoom-in-95 duration-200 shadow-xl shadow-primary/5">
              <div className="flex items-center gap-3">
                <FolderGit2 className="text-primary" size={24} />
                <h3 className="font-bold text-xl tracking-tight">Add Local Project</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Absolute Folder Path</label>
                  <input
                    type="text"
                    placeholder="/Users/name/workspaces/my-app"
                    value={newWatcher.folderpath}
                    onChange={(e) => setNewWatcher({ ...newWatcher, folderpath: e.target.value })}
                    className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium text-sm transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Project Name (Identifier)</label>
                  <input
                    type="text"
                    placeholder="my-app"
                    value={newWatcher.projectname}
                    onChange={(e) => setNewWatcher({ ...newWatcher, projectname: e.target.value })}
                    className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium text-sm transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Collection (Group)</label>
                  <input
                    type="text"
                    placeholder="default"
                    value={newWatcher.collection}
                    onChange={(e) => setNewWatcher({ ...newWatcher, collection: e.target.value })}
                    className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium text-sm transition-all"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 px-1">
                <button
                  onClick={async () => {
                    const newValue = !summarize;
                    setSummarize(newValue);
                    // Also update global config
                    try {
                      await axios.post('/api/config', { ...config, summarize: newValue });
                      setConfig(prev => ({ ...prev, summarize: newValue }));
                    } catch (err) {
                      console.error('Failed to update config:', err);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-xs transition-all",
                    summarize ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"
                  )}
                >
                  {summarize ? <Plus size={14} className="rotate-45" /> : <Plus size={14} />}
                  AI Summarization {summarize ? "Enabled" : "Disabled"}
                </button>
                {summarize && (
                  <button
                    onClick={openTestModal}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-xl font-bold text-xs hover:bg-secondary/80 transition-all text-muted-foreground hover:text-foreground"
                  >
                    <Wand2 size={14} /> Test AI Summarization
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground font-medium">Use Hierarchical Context for higher search accuracy (slower).</p>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info size={14} />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Note: This will add a persistent watcher and start initial indexing.</p>
                </div>
                <button
                  onClick={handleAddWatcher}
                  disabled={!newWatcher.folderpath || !newWatcher.projectname}
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
                  <Layers size={18} className="text-primary" />
                  <h3 className="font-bold text-lg tracking-tight">Managed Projects</h3>
                </div>
                <div className="flex gap-4">
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
                      Stop All Sync
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* Combine projects from KB and Watchers for a unified view */}
                {(() => {
                  const allProjectNames = new Set([
                    ...Object.values(kb).flat(),
                    ...watchers.map(w => w.projectname)
                  ]);

                  if (allProjectNames.size === 0 && !loading) {
                    return (
                      <div className="bg-secondary/20 border border-dashed border-border rounded-2xl p-12 text-center">
                        <p className="text-sm text-muted-foreground font-medium italic">No projects found. Connect a folder to get started.</p>
                      </div>
                    );
                  }

                  return Array.from(allProjectNames).sort().map(project => {
                    const watcher = watchers.find(w => w.projectname === project);
                    const isWatched = !!watcher;

                    // Find collection for this project
                    let collection = "default";
                    for (const [col, projs] of Object.entries(kb)) {
                      if (projs.includes(project)) {
                        collection = col;
                        break;
                      }
                    }
                    if (watcher) collection = watcher.collection;

                    return (
                      <div key={project} className={cn(
                        "bg-card border border-border p-4 md:p-6 rounded-3xl flex flex-col gap-4 group hover:border-primary/30 transition-all shadow-sm",
                        removingWatcher === watcher?.folderpath && "opacity-50 grayscale pointer-events-none"
                      )}>
                        {/* Project Header Info */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h4 className="font-bold text-lg leading-tight text-foreground truncate max-w-full">{project}</h4>
                                {isWatched ? (
                                  <span className="flex-shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                                  </span>
                                ) : (
                                  <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-border">
                                    Static
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.1em] bg-secondary/50 px-2 py-0.5 rounded-full border border-border/50">{collection}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                {watcher && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground group/path">
                                    <FolderGit2 size={12} className="shrink-0" />
                                    <p className="text-[11px] font-mono truncate hover:text-foreground transition-colors" title={watcher.folderpath}>{watcher.folderpath}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => onExplore?.({ projectName: project, collection })}
                            className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all shrink-0"
                            title="Explore in Search"
                          >
                            <ExternalLink size={18} />
                          </button>
                        </div>

                        {/* Action Buttons Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border/10">
                          <div className="flex flex-wrap items-center gap-2">
                            {isWatched ? (
                              <button
                                onClick={() => handleRemoveWatcher(watcher.folderpath, watcher.projectname)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 rounded-xl transition-all border border-amber-500/20 text-[10px] font-black uppercase tracking-widest"
                              >
                                <EyeOff size={14} /> Stop Sync
                              </button>
                            ) : (
                              <button
                                onClick={() => handleEnableWatch(project, collection)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 rounded-xl transition-all border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest"
                              >
                                <Eye size={14} /> Start Sync
                              </button>
                            )}

                            <button
                              onClick={() => {
                                if (watcher) {
                                  handleReindex(watcher);
                                } else {
                                  notify('error', "Full re-index for static projects requires re-connecting the folder.");
                                }
                              }}
                              disabled={!isWatched}
                              className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary-600 hover:bg-primary/20 rounded-xl transition-all border border-primary/20 disabled:opacity-30 text-[10px] font-black uppercase tracking-widest"
                            >
                              <RefreshCw size={14} /> Re-index
                            </button>
                          </div>

                          <button
                            onClick={() => handleDeleteProject(project)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 text-red-600 hover:text-red-600 border border-red-500/20 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest"
                          >
                            <Trash2 size={14} /> Delete Index
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

          </div>
        </div>
      </div>
      {showDebug && <DebugPanel />}

      {/* Test Summarization Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-card border border-border w-full max-w-4xl h-[85vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-border flex items-center justify-between bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
                  <Wand2 size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Test AI Summarization</h3>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Preview & Tune Prompt</p>
                </div>
              </div>
              <button 
                onClick={() => setShowTestModal(false)}
                className="p-3 hover:bg-secondary rounded-2xl transition-colors text-muted-foreground"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left Panel: Configuration */}
              <div className="w-full md:w-1/3 border-r border-border p-6 flex flex-col gap-6 bg-secondary/10 overflow-y-auto">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Test Target</label>
                  <div className="flex gap-2 p-1 bg-secondary rounded-xl">
                    <button 
                      onClick={() => setTestTarget('code')}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        testTarget === 'code' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Source Code
                    </button>
                    <button 
                      onClick={() => setTestTarget('docs')}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        testTarget === 'docs' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Docs
                    </button>
                  </div>
                </div>

                <div className="space-y-3 flex-1 flex flex-col">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Prompt Template</label>
                    {configPrompts && (
                      <select 
                        className="bg-secondary border border-border rounded-lg px-2 py-1 text-[10px] font-medium focus:outline-none focus:border-primary max-w-[150px]"
                        onChange={(e) => {
                          const templates = testTarget === 'code' ? configPrompts.summarizeTemplates : configPrompts.docSummarizeTemplates;
                          const selected = templates?.find((t: any) => t.id === e.target.value);
                          if (selected) setTestPrompt(selected.text);
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Load from Library...</option>
                        {(testTarget === 'code' ? configPrompts.summarizeTemplates : configPrompts.docSummarizeTemplates)?.map((t: any) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex-1 min-h-[200px]">
                    <PromptEditor 
                      title="Edit Template" 
                      description="Modify strictly for this test. To save permanently, update in Prompts view." 
                      value={testPrompt} 
                      onChange={setTestPrompt} 
                      height="h-full"
                      placeholder="Enter prompt template..."
                    />
                  </div>
                </div>

                <button 
                  onClick={handleTestSummarization}
                  disabled={testing}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-widest text-xs hover:opacity-90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  {testing ? 'Running Model...' : 'Run Test'}
                </button>
              </div>

              {/* Right Panel: Results */}
              <div className="w-full md:w-2/3 p-6 bg-card flex flex-col gap-4 overflow-hidden">
                {testResult ? (
                  <div className="h-full flex flex-col gap-4 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md">Success</span>
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[300px]">{testResult.file}</span>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col gap-2 min-h-0">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">AI Summary Output</label>
                      <div className="flex-1 bg-secondary/30 rounded-2xl p-4 border border-border overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                        {testResult.summary}
                      </div>
                    </div>

                    <div className="h-1/3 flex flex-col gap-2 min-h-0">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Source Content (Truncated)</label>
                      <div className="flex-1 bg-secondary/10 rounded-2xl p-4 border border-border/50 overflow-y-auto font-mono text-[10px] text-muted-foreground">
                        {testResult.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-50">
                    <div className="bg-secondary p-4 rounded-full mb-4">
                      <Zap size={32} className="text-muted-foreground" />
                    </div>
                    <h4 className="font-bold text-lg">Ready to Test</h4>
                    <p className="text-sm text-muted-foreground max-w-xs mt-2">
                      Click "Run Test" to pick a random file from your folder and generate a summary using the template.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border p-8 rounded-[2rem] shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center gap-4">
              <div className={cn(
                "p-4 rounded-2xl",
                confirmModal.variant === 'danger' ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
              )}>
                {confirmModal.variant === 'danger' ? <AlertCircle size={32} /> : <Info size={32} />}
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">{confirmModal.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 px-2">{confirmModal.message}</p>
              </div>
              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className={cn(
                    "flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all shadow-lg",
                    confirmModal.variant === 'danger'
                      ? "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                      : "bg-primary hover:bg-primary/90 shadow-primary/20"
                  )}
                >
                  {confirmModal.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, isStatus, active }: { label: string, value: string | number, icon: React.ElementType, color: string, isStatus?: boolean, active?: boolean }) {
  const colorMap: Record<string, string> = {
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
