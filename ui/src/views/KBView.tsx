import { useState, useEffect } from 'react';
import { Database, FolderGit2, Layers, Plus, ExternalLink } from 'lucide-react';
import axios from 'axios';

interface Stats {
  collections: number;
  projects: number;
  status: string;
}

export default function KBView() {
  const [stats, setStats] = useState<Stats>({ collections: 0, projects: 0, status: 'idle' });
  const [kb, setKb] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, kbRes] = await Promise.all([
          axios.get('/api/stats'),
          axios.get('/api/kb')
        ]);
        setStats(statsRes.data);
        setKb(kbRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="p-8 space-y-8 h-full flex flex-col max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Knowledge Base</h2>
          <p className="text-muted-foreground font-medium">Explore and manage your indexed projects across all collections.</p>
        </div>
        <button className="bg-primary text-primary-foreground px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20">
          <Plus size={20} />
          Index New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border p-6 rounded-3xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">Collections</p>
            <p className="text-4xl font-bold tracking-tighter">{stats.collections}</p>
          </div>
          <div className="p-4 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Layers size={28} />
          </div>
        </div>
        <div className="bg-card border border-border p-6 rounded-3xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">Total Projects</p>
            <p className="text-4xl font-bold tracking-tighter">{stats.projects}</p>
          </div>
          <div className="p-4 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <FolderGit2 size={28} />
          </div>
        </div>
        <div className="bg-card border border-border p-6 rounded-3xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">System Status</p>
            <p className="text-2xl font-bold tracking-tight text-green-400 uppercase">{stats.status}</p>
          </div>
          <div className="p-4 rounded-2xl bg-green-500/10 text-green-400 border border-green-500/20">
            <Activity size={28} />
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-auto pr-2">
        {Object.entries(kb).length > 0 ? (
          Object.entries(kb).map(([collection, projects]) => (
            <div key={collection} className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <Layers size={18} className="text-primary" />
                <h3 className="font-bold text-lg tracking-tight">Collection: {collection}</h3>
                <div className="h-px flex-1 bg-border/50 ml-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                  <div key={project} className="bg-card border border-border p-5 rounded-2xl hover:border-primary/40 transition-all group shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h4 className="font-bold text-lg group-hover:text-primary transition-colors">{project}</h4>
                        <p className="text-xs text-muted-foreground font-medium">Ready for search</p>
                      </div>
                      <div className="text-muted-foreground/30 group-hover:text-primary/50 transition-colors">
                        <FolderGit2 size={24} />
                      </div>
                    </div>
                    <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/50">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active</span>
                      <button className="text-xs font-bold text-primary flex items-center gap-1.5 hover:underline">
                        Explore <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : !loading && (
          <div className="flex-1 bg-card border border-border rounded-3xl p-12 flex flex-col items-center justify-center space-y-4 shadow-inner min-h-[400px]">
            <div className="bg-secondary p-8 rounded-full text-muted-foreground/20 border border-border/50">
              <Database size={80} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold tracking-tight">Empty Knowledge Base</h3>
              <p className="text-muted-foreground max-w-xs font-medium">Start by indexing a folder using the "index" command or the button above.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Activity({ size, className }: { size: number, className?: string }) {
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