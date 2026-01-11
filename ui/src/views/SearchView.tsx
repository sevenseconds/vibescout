import { useState } from 'react';
import { Search, ArrowRight, FileCode2, Loader2, Filter, X, Sparkles, Maximize2 } from 'lucide-react';
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
  onAskChat?: (data: { query?: string; projectName?: string; collection?: string; fileTypes?: string[] }) => void;
}

export default function SearchView({ initialFilters, onFiltersClear, onAskChat }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(!!initialFilters?.projectName || !!initialFilters?.collection);
  const [summarizing, setSummarizing] = useState(false);
  const [draftSummary, setDraftSummary] = useState('');
  
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Filters
  const [projectName, setProjectName] = useState(initialFilters?.projectName || '');
  const [collection, setCollection] = useState(initialFilters?.collection || '');
  const [fileType, setFileType] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setDraftSummary(''); // Clear old summary
    try {
      const parsedFileTypes = fileType 
        ? fileType.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : undefined;

      const response = await axios.post('/api/search', { 
        query,
        projectName: projectName || undefined,
        collection: collection || undefined,
        fileTypes: parsedFileTypes
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
                  placeholder="e.g. .ts, .js"
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
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Found {results.length} matches
              </h3>
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
  );
}