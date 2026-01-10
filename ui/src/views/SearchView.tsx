import { useState } from 'react';
import { Search, ArrowRight, FileCode2, Loader2 } from 'lucide-react';
import axios from 'axios';

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

export default function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const response = await axios.post('/api/search', { query });
      // The API returns { content: [{ type: 'text', text: formattedText }] } for MCP
      // But we need raw results for UI. 
      // Wait, I updated handleSearchCode in core.js to return raw results but handleApiRequest 
      // calls handleSearchCode which returns MCP response.
      // I should update handleApiRequest to call searchCode directly for raw data.
      setResults(response.data); 
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-12">
      <div className="space-y-4 pt-12">
        <h2 className="text-4xl font-bold tracking-tight">Search your Codebase</h2>
        <p className="text-muted-foreground text-lg max-w-2xl font-medium">
          Semantic search powered by local embeddings. Find classes, functions, and logic across all your indexed projects.
        </p>
      </div>

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
          className="w-full bg-card border-2 border-border rounded-2xl py-6 pl-14 pr-24 text-xl focus:outline-none focus:border-primary transition-all shadow-xl shadow-black/20 font-medium"
        />
        <div className="absolute right-4 inset-y-4 flex items-center gap-2">
          <button 
            onClick={handleSearch}
            disabled={loading}
            className="bg-primary text-primary-foreground p-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
          </button>
        </div>
      </div>

      <div className="space-y-6 pb-12">
        {results.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {results.map((result, i) => (
              <div key={i} className="bg-card border border-border p-6 rounded-2xl space-y-4 shadow-sm hover:border-primary/50 transition-colors group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg text-primary">
                      <FileCode2 size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{result.name}</h3>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        {result.type} • {result.collection}/{result.projectName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-muted-foreground">{result.filePath}:{result.startLine}</p>
                    <div className="mt-1 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">
                      Score: {result.rerankScore?.toFixed(4)}
                    </div>
                  </div>
                </div>
                {result.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed italic bg-secondary/30 p-3 rounded-xl border border-border/50">
                    {result.summary}
                  </p>
                )}
                <pre className="text-xs font-mono bg-black/20 p-4 rounded-xl overflow-x-auto border border-border/30 text-muted-foreground">
                  <code>{result.content.substring(0, 300)}...</code>
                </pre>
              </div>
            ))}
          </div>
        ) : !loading && query && (
          <div className="text-center py-20 text-muted-foreground font-medium">
            No results found for "{query}"
          </div>
        )}
      </div>
    </div>
  );
}