import { useState, useEffect } from 'react';
import { Search, ArrowRight, FileCode2, Loader2, Filter, X, Sparkles, Maximize2, Code, FileText, Layers, Bug, Database, FolderGit2 } from 'lucide-react';
import axios from 'axios';
import CodeBlock from '../components/CodeBlock';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import DebugPanel from '../components/DebugPanel';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SearchResult {
  projectName: string;
  collection: string;
  filePath: string;
  name: string;
  type: string;
  category: 'code' | 'documentation';
  startLine: number;
  endLine: number;
  summary?: string;
  content: string;
  rerankScore: number;

  // Git metadata
  lastCommitAuthor?: string;
  lastCommitEmail?: string;
  lastCommitDate?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  commitCount6m?: number;
  churnLevel?: 'low' | 'medium' | 'high';
}

interface SearchViewProps {
  initialFilters?: { projectName?: string; collection?: string };
  onFiltersClear?: () => void;
  onAskChat?: (data: { query?: string; projectName?: string; collection?: string; fileTypes?: string[] }) => void;
}

export default function SearchView({ initialFilters, onFiltersClear, onAskChat }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(!!initialFilters?.projectName || !!initialFilters?.collection);
  const [summarizing, setSummarizing] = useState(false);
  const [draftSummary, setDraftSummary] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // KB Data for dropdowns
  const [kbData, setKbData] = useState<Record<string, string[]>>({});
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [availableCollections, setAvailableCollections] = useState<string[]>([]);

  // Filters
  const [projectName, setProjectName] = useState(initialFilters?.projectName || '');
  const [collection, setCollection] = useState(initialFilters?.collection || '');
  const [fileType, setFileType] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'code' | 'documentation'>('all');

  // Git filters
  const [authorFilter, setAuthorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [churnLevels, setChurnLevels] = useState<string[]>([]);

  useEffect(() => {
    const fetchKb = async () => {
      try {
        const res = await axios.get('/api/kb');
        setKbData(res.data);
        const cols = Object.keys(res.data);
        setAvailableCollections(cols);
        
        // Flatten projects
        const projs = new Set<string>();
        Object.values(res.data).forEach((pList: any) => pList.forEach((p: string) => projs.add(p)));
        setAvailableProjects(Array.from(projs));
      } catch (err) {
        console.error('Failed to fetch KB data', err);
      }
    };
    fetchKb();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setDraftSummary(''); // Clear old summary
    try {
      const parsedFileTypes = fileType
        ? fileType.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : undefined;

      const parsedAuthors = authorFilter
        ? authorFilter.split(',').map(a => a.trim()).filter(a => a.length > 0)
        : undefined;

      const response = await axios.post('/api/search', {
        query,
        projectName: projectName || undefined,
        collection: collection || undefined,
        fileTypes: parsedFileTypes,
        categories: filterCategory === 'all' ? undefined : [filterCategory],
        authors: parsedAuthors,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        churnLevels: churnLevels.length > 0 ? churnLevels : undefined
      });
      setResults(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (results.length === 0) return;
    setSummarizing(true);
    try {
      const response = await axios.post('/api/search/summarize', { 
        query, 
        results 
      });
      setDraftSummary(response.data.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setSummarizing(false);
    }
  };

  const handlePreview = async (filePath: string) => {
    setLoadingPreview(true);
    setPreviewFile(filePath);
    try {
      const res = await axios.get(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      setPreviewContent(res.data.content);
    } catch (err) {
      console.error('Failed to read file:', err);
      setPreviewFile(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleAskChat = (textOverride?: string) => {
    const parsedFileTypes = fileType 
      ? fileType.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : undefined;

    onAskChat?.({
      query: textOverride || query,
      projectName: projectName || undefined,
      collection: collection || undefined,
      fileTypes: parsedFileTypes
    });
  };

  const clearFilters = () => {
    setProjectName('');
    setCollection('');
    setFileType('');
    setFilterCategory('all');
    onFiltersClear?.();
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-6xl mx-auto space-y-8 pb-20">
          <div className="flex justify-end gap-2 pt-4">
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
          </div>
          <div className="space-y-4 pt-4 text-center">
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
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Collection</label>
                    <div className="relative">
                      <select 
                        value={collection} 
                        onChange={(e) => {
                          const newCol = e.target.value;
                          setCollection(newCol);
                          // Clear project if it's not in the new collection
                          if (projectName && newCol && kbData[newCol] && !kbData[newCol].includes(projectName)) {
                            setProjectName('');
                          }
                        }}
                        className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary appearance-none"
                      >
                        <option value="">All Collections</option>
                        {availableCollections.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <Database size={14} className="absolute right-4 top-3 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Project</label>
                    <div className="relative">
                      <select 
                        value={projectName} 
                        onChange={(e) => setProjectName(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary appearance-none"
                      >
                        <option value="">All Projects</option>
                        {collection 
                          ? kbData[collection]?.map(p => <option key={p} value={p}>{p}</option>)
                          : availableProjects.map(p => <option key={p} value={p}>{p}</option>)
                        }
                      </select>
                      <FolderGit2 size={14} className="absolute right-4 top-3 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">File Extensions</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={fileType}
                        onChange={(e) => setFileType(e.target.value)}
                        placeholder=".ts, .md (optional)"
                        className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                      />
                      <FileCode2 size={14} className="absolute right-4 top-3 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Git Filters */}
                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Git Filters</h4>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Authors (comma-separated)</label>
                      <input
                        type="text"
                        value={authorFilter}
                        onChange={(e) => setAuthorFilter(e.target.value)}
                        placeholder="Alice, Bob"
                        className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">From Date</label>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">To Date</label>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Code Stability (Churn Level)</label>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={churnLevels.includes('low')}
                            onChange={(e) => {
                              if (e.target.checked) setChurnLevels([...churnLevels, 'low']);
                              else setChurnLevels(churnLevels.filter(c => c !== 'low'));
                            }}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="text-green-400">Low (Stable)</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={churnLevels.includes('medium')}
                            onChange={(e) => {
                              if (e.target.checked) setChurnLevels([...churnLevels, 'medium']);
                              else setChurnLevels(churnLevels.filter(c => c !== 'medium'));
                            }}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="text-yellow-400">Medium</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={churnLevels.includes('high')}
                            onChange={(e) => {
                              if (e.target.checked) setChurnLevels([...churnLevels, 'high']);
                              else setChurnLevels(churnLevels.filter(c => c !== 'high'));
                            }}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="text-red-400">High (Frequent)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-[10px] text-primary/70 font-medium">
                    <strong>Pro Tip:</strong> If category filtering (Code/Docs) doesn't seem to work, try a <strong>Force Re-index</strong> in the Knowledge Base view to update your database schema.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6 pb-12">
            {results.length > 0 ? (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                  <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50 self-start">
                    <button 
                      onClick={() => setFilterCategory('all')}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        filterCategory === 'all' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Layers size={14} /> All
                    </button>
                    <button 
                      onClick={() => setFilterCategory('code')}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        filterCategory === 'code' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Code size={14} /> Code
                    </button>
                    <button 
                      onClick={() => setFilterCategory('documentation')}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        filterCategory === 'documentation' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <FileText size={14} /> Docs
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={handleSummarize}
                      disabled={summarizing}
                      className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-xl font-bold text-xs hover:bg-secondary/80 transition-all text-muted-foreground disabled:opacity-50"
                    >
                      {summarizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      Generate Best Question
                    </button>
                    <button 
                      onClick={() => handleAskChat()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-xs hover:bg-primary/20 transition-all shadow-lg shadow-primary/5"
                    >
                      Ask AI about this
                    </button>
                  </div>
                </div>

                {draftSummary && (
                  <div className="bg-primary/5 border-2 border-primary/20 p-6 rounded-3xl space-y-4 animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-2 text-primary">
                      <Sparkles size={18} />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">AI Smart Question</h4>
                    </div>
                    <div className="text-sm text-foreground/90 leading-relaxed font-bold bg-black/20 p-4 rounded-2xl border border-primary/10 italic">
                      "{draftSummary}"
                    </div>
                    <div className="flex justify-end">
                      <button 
                        onClick={() => handleAskChat(draftSummary)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-black uppercase tracking-widest text-[10px] hover:opacity-90 transition-all shadow-xl shadow-primary/20"
                      >
                        Ask this in Chat <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                  {results
                    .filter(r => filterCategory === 'all' || r.category === filterCategory)
                    .map((result, i) => (
                    <div key={i} className="bg-card border border-border p-6 rounded-3xl space-y-4 shadow-sm hover:border-primary/50 transition-all group relative overflow-hidden">
                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2.5 rounded-xl shadow-inner",
                            result.category === 'documentation' ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
                          )}>
                            {result.category === 'documentation' ? <FileText size={22} /> : <FileCode2 size={22} />}
                          </div>
                          <div>
                            <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{result.name}</h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                                {result.type}
                              </span>
                              <span className="w-1 h-1 rounded-full bg-border" />
                              <span className="text-[10px] text-primary/70 font-black uppercase tracking-widest">
                                {result.collection}/{result.projectName}
                              </span>

                              {/* Git Info */}
                              {result.lastCommitAuthor && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-border" />
                                  <span className="text-[10px] text-muted-foreground font-medium" title={`Author: ${result.lastCommitAuthor}`}>
                                    👤 {result.lastCommitAuthor}
                                  </span>
                                </>
                              )}
                              {result.lastCommitDate && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-border" />
                                  <span className="text-[10px] text-muted-foreground font-medium" title={`Last modified: ${new Date(result.lastCommitDate).toLocaleDateString()}`}>
                                    📅 {new Date(result.lastCommitDate).toLocaleDateString()}
                                  </span>
                                </>
                              )}
                              {result.churnLevel && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-border" />
                                  <span className={cn(
                                    "text-[10px] font-bold px-2 py-0.5 rounded",
                                    result.churnLevel === 'low' ? 'bg-green-500/20 text-green-400' :
                                    result.churnLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-red-500/20 text-red-400'
                                  )}
                                  title={`Churn: ${result.churnLevel} (${result.commitCount6m || 0} commits in 6 months)`}
                                  >
                                    {result.churnLevel} churn
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <button 
                                              onClick={() => handlePreview(result.filePath)}
                                              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                              title="View Full File"
                                            >
                                              <Maximize2 size={18} />
                                            </button>
                                            <button 
                                              onClick={() => onAskChat?.({ query: `Tell me about ${result.name} in ${result.filePath}`, projectName: result.projectName })}
                                              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                              title="Ask about this specifically"
                                            >
                                              <Sparkles size={18} />
                                            </button>
                                          </div>
                                        </div>
                                        {result.summary && (                    <p className="text-sm text-muted-foreground leading-relaxed italic bg-secondary/30 p-4 rounded-2xl border border-border/50 relative z-10">
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
              </div>
            ) : !loading && query && (
              <div className="text-center py-20 bg-secondary/10 border border-dashed border-border rounded-3xl">
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">No results match your query and filters.</p>
              </div>
            )}
          </div>

          {/* Full File Preview Modal */}
          {previewFile && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-card border border-border w-full max-w-6xl h-full flex flex-col rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-border flex items-center justify-between bg-secondary/30">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
                      <FileCode2 size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg truncate max-w-md">{previewFile.split('/').pop()}</h3>
                      <p className="text-[10px] font-mono text-muted-foreground truncate max-w-xl">{previewFile}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setPreviewFile(null)}
                    className="p-3 hover:bg-secondary rounded-2xl transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="flex-1 overflow-hidden relative">
                  {loadingPreview ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
                      <Loader2 className="animate-spin text-primary" size={48} />
                    </div>
                  ) : (
                    <div className="h-full overflow-auto p-6 scrollbar-thin">
                      <CodeBlock 
                        code={previewContent} 
                        filePath={previewFile} 
                        showOpenInEditor 
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-border bg-secondary/30 flex justify-end">
                  <button 
                    onClick={() => setPreviewFile(null)}
                    className="px-8 py-3 bg-primary text-primary-foreground rounded-2xl font-bold hover:opacity-90 transition-all shadow-xl shadow-primary/20"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {showDebug && <DebugPanel />}
    </div>
  );
}