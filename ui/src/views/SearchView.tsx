import { useState } from 'react';
import { Search, ArrowRight, FileCode2, Loader2, Filter, X } from 'lucide-react';
import axios from 'axios';
import CodeBlock from '../components/CodeBlock';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SearchResult {
  projectName: string;
  collection: string;
  filePath: string;
  name: string;
  type: string;
  startLine: number;
  endLine: number;
  summary?: string;
  content: string;
  rerankScore: number;
}

interface SearchViewProps {
  initialFilters?: { projectName?: string; collection?: string };
  onFiltersClear?: () => void;
}

export default function SearchView({ initialFilters, onFiltersClear }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(!!initialFilters?.projectName || !!initialFilters?.collection);
  
  // Filters
  const [projectName, setProjectName] = useState(initialFilters?.projectName || '');
  const [collection, setCollection] = useState(initialFilters?.collection || '');
  const [fileType, setFileType] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const response = await axios.post('/api/search', { 
        query,
        projectName: projectName || undefined,
        collection: collection || undefined,
        fileType: fileType || undefined
      });
      setResults(response.data); 
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setProjectName('');
    setCollection('');
    setFileType('');
    onFiltersClear?.();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 pb-20">
      <div className="space-y-4 pt-12 text-center">
        <h2 className="text-5xl font-black tracking-tighter text-foreground">Search <span className="text-primary">Intelligence</span></h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-medium">
          Semantic search across your indexed codebases.
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
            <Search className="text-muted-foreground group-focus-within:text-primary transition-colors" size={24} />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="How do I handle user authentication?"
            className="w-full bg-card border-2 border-border rounded-2xl py-6 pl-14 pr-32 text-xl focus:outline-none focus:border-primary transition-all shadow-xl shadow-black/20 font-medium"
          />
          <div className="absolute right-4 inset-y-4 flex items-center gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-2 rounded-xl transition-all border",
                showFilters || projectName || collection || fileType 
                  ? "bg-primary/10 border-primary/30 text-primary" 
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              )}
              title="Advanced Filters"
            >
              <Filter size={20} />
            </button>
            <button 
              onClick={handleSearch}
              disabled={loading}
              className="bg-primary text-primary-foreground p-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-primary/20"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="bg-card border border-border p-6 rounded-2xl shadow-lg animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Search Filters</h3>
              {(projectName || collection || fileType) && (
                <button 
                  onClick={clearFilters}
                  className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline flex items-center gap-1"
                >
                  <X size={12} /> Clear All
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Project Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. vibescout"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Collection</label>
                <input 
                  type="text" 
                  placeholder="e.g. default"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">File Extension</label>
                <input 
                  type="text" 
                  placeholder="e.g. .ts"
                  value={fileType}
                  onChange={(e) => setFileType(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary transition-all"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6 pb-12">
        {results.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {results.map((result, i) => (
              <div key={i} className="bg-card border border-border p-6 rounded-3xl space-y-4 shadow-sm hover:border-primary/50 transition-all group relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2.5 rounded-xl text-primary shadow-inner">
                      <FileCode2 size={22} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{result.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                          {result.type}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span className="text-[10px] text-primary/70 font-black uppercase tracking-widest">
                          {result.collection}/{result.projectName}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-muted-foreground break-all max-w-[200px]">{result.filePath}:{result.startLine}</p>
                    <div className="mt-1.5 inline-flex items-center rounded-full bg-secondary border border-border/50 px-2.5 py-0.5 text-[10px] font-black text-secondary-foreground uppercase tracking-widest">
                      Rerank: {result.rerankScore?.toFixed(4)}
                    </div>
                  </div>
                </div>
                {result.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed italic bg-secondary/30 p-4 rounded-2xl border border-border/50 relative z-10">
                    {result.summary}
                  </p>
                )}
                
                <div className="relative z-10">
                  <CodeBlock 
                    code={result.content} 
                    filePath={result.filePath} 
                    line={result.startLine}
                    showOpenInEditor 
                  />
                </div>
              </div>
            ))}
          </div>
        ) : !loading && query && (
          <div className="text-center py-20 bg-secondary/10 border border-dashed border-border rounded-3xl">
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">No results match your query and filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}