import { useState, useEffect, useRef, useMemo } from 'react';
// @ts-ignore
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';
import { Share2, Loader2, Maximize2, X, ExternalLink, Box, ArrowUpRight, ArrowDownRight, RefreshCw, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Node {
  id: string;
  label: string;
  group: string;
  collection: string;
}

interface Link {
  source: string;
  target: string;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

const COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', 
  '#ec4899', '#06b6d4', '#84cc16', '#6366f1', '#f97316'
];

export default function GraphView() {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [fileDeps, setFileDeps] = useState<any>(null);
  const [fetchingIntelligence, setFetchingIntelligence] = useState(false);
  const [cycles, setCycles] = useState<string[][]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const fgRef = useRef<any>(null);

  const findCycles = (graphData: GraphData) => {
    const adj = new Map<string, string[]>();
    graphData.links.forEach(l => {
      const source = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const target = typeof l.target === 'string' ? l.target : (l.target as any).id;
      if (!adj.has(source)) adj.set(source, []);
      adj.get(source)!.push(target);
    });

    const detectedCycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (u: string) => {
      visited.add(u);
      recStack.add(u);
      path.push(u);

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        if (!visited.has(v)) {
          dfs(v);
        } else if (recStack.has(v)) {
          const cycleStartIdx = path.indexOf(v);
          detectedCycles.push([...path.slice(cycleStartIdx), v]);
        }
      }

      recStack.delete(u);
      path.pop();
    };

    graphData.nodes.forEach(n => {
      if (!visited.has(n.id)) dfs(n.id);
    });

    return detectedCycles;
  };

  const handleScanCycles = () => {
    setIsScanning(true);
    setTimeout(() => {
      const result = findCycles(data);
      setCycles(result);
      setIsScanning(false);
      if (result.length > 0) {
        const cycleNodes = new Set<string>();
        result.forEach(cycle => cycle.forEach(nodeId => cycleNodes.add(nodeId)));
        setHighlightNodes(cycleNodes);
      }
    }, 100);
  };

  const handleOpenFile = async (filePath: string, line = 1) => {
    try {
      await axios.post('/api/open', { filePath, line });
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const fetchSymbolIntelligence = async (filePath: string) => {
    setFetchingIntelligence(true);
    setFileDeps(null);
    try {
      const response = await axios.get(`/api/deps?filePath=${encodeURIComponent(filePath)}`);
      setFileDeps(response.data);
    } catch (err) {
      console.error('Failed to fetch symbol intelligence:', err);
    } finally {
      setFetchingIntelligence(false);
    }
  };

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const response = await axios.get('/api/graph');
        if (response.data && response.data.nodes) {
          setData(response.data);
        } else {
          setData({ nodes: [], links: [] });
        }
      } catch (err) {
        console.error(err);
        setData({ nodes: [], links: [] });
      } finally {
        setLoading(false);
      }
    };
    fetchGraph();
  }, []);

  const groupColors = useRef<Record<string, string>>({});
  const getGroupColor = (group: string) => {
    if (!groupColors.current[group]) {
      const idx = Object.keys(groupColors.current).length % COLORS.length;
      groupColors.current[group] = COLORS[idx];
    }
    return groupColors.current[group];
  };

  const handleNodeClick = (node: any) => {
    setSelectedNode(node);
    fetchSymbolIntelligence(node.id);
    
    const neighbors = new Set();
    data.links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
      if (sourceId === node.id) neighbors.add(targetId);
      if (targetId === node.id) neighbors.add(sourceId);
    });

    neighbors.add(node.id);
    setHighlightNodes(neighbors);
    fgRef.current.centerAt(node.x, node.y, 400);
  };

  const clearHighlight = () => {
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setFileDeps(null);
    setCycles([]);
  };

  const dependents = useMemo(() => {
    if (!selectedNode) return [];
    return data.links
      .filter(l => {
        const targetId = typeof l.target === 'string' ? l.target : (l.target as any).id;
        return targetId === selectedNode.id;
      })
      .map(l => typeof l.source === 'string' ? l.source : (l.source as any).id);
  }, [selectedNode, data]);

  const dependencies = useMemo(() => {
    if (!selectedNode) return [];
    return data.links
      .filter(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as any).id;
        return sourceId === selectedNode.id;
      })
      .map(l => typeof l.target === 'string' ? l.target : (l.target as any).id);
  }, [selectedNode, data]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex relative bg-[#0a0a0a] overflow-hidden">
      {/* Side Panel */}
      <div className={cn(
        "absolute top-0 right-0 h-full w-96 bg-card/95 backdrop-blur-md border-l border-border z-[100] transition-transform duration-300 transform shadow-2xl overflow-y-auto",
        (selectedNode || cycles.length > 0) ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-6 space-y-8 pb-20">
          {cycles.length > 0 && !selectedNode && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle size={20} />
                <h3 className="text-xl font-bold tracking-tight">Circular Deps</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Found {cycles.length} import loops.
              </p>
              <div className="space-y-2">
                {cycles.map((cycle, i) => (
                  <div key={i} className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400/70">Loop #{i + 1}</p>
                    <p className="text-[10px] font-mono text-muted-foreground break-all">
                      {cycle.map(id => id.split('/').pop()).join(' → ')}
                    </p>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => { setCycles([]); setHighlightNodes(new Set()); }}
                className="w-full py-2.5 bg-secondary border border-border rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-secondary/80 transition-all"
              >
                Clear Results
              </button>
            </div>
          )}

          {selectedNode && (
            <div className="space-y-8">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getGroupColor(selectedNode.group) }} />
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{selectedNode.group}</span>
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight text-foreground break-all">{selectedNode.label}</h3>
                </div>
                <button onClick={clearHighlight} className="p-2 hover:bg-secondary rounded-xl text-muted-foreground transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Box size={18} />
                  <h4 className="font-bold text-sm uppercase tracking-wider">File Path</h4>
                </div>
                <p className="text-xs font-mono bg-secondary/50 p-3 rounded-xl border border-border/50 text-muted-foreground break-all">
                  {selectedNode.id}
                </p>
                <button 
                  onClick={() => handleOpenFile(selectedNode.id)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                >
                  <ExternalLink size={16} /> Open in Editor
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Symbol Intelligence</h4>
                    {fetchingIntelligence && <Loader2 size={14} className="animate-spin text-primary" />}
                  </div>
                  {fileDeps && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Exports ({fileDeps.exports?.length || 0})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fileDeps.exports?.map((s: string) => (
                            <span key={s} className="px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-mono border border-emerald-500/20">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Imported Symbols</p>
                        <div className="space-y-3">
                          {fileDeps.imports?.map((imp: any, i: number) => (
                            <div key={i} className="space-y-1.5 p-2 rounded-lg bg-secondary/20 border border-border/30">
                              <p className="text-[10px] font-mono text-blue-400 truncate">{imp.source}</p>
                              <div className="flex flex-wrap gap-1">
                                {imp.symbols?.map((s: string) => (
                                  <span key={s} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[9px] font-mono border border-blue-500/10">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-2 text-green-400">
                    <ArrowUpRight size={18} />
                    <h4 className="font-bold text-sm uppercase tracking-wider">Imported By ({dependents.length})</h4>
                  </div>
                  <div className="space-y-2">
                    {dependents.map(d => (
                      <div key={d} className="text-[11px] font-medium p-2 bg-secondary/30 rounded-lg border border-border/30 truncate text-muted-foreground">
                        {d.split('/').pop()}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-blue-400">
                    <ArrowDownRight size={18} />
                    <h4 className="font-bold text-sm uppercase tracking-wider">Imports ({dependencies.length})</h4>
                  </div>
                  <div className="space-y-2">
                    {dependencies.map(d => (
                      <div key={d} className="text-[11px] font-medium p-2 bg-secondary/30 rounded-lg border border-border/30 truncate text-muted-foreground">
                        {d.split('/').pop()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative">
        <div className="absolute top-6 left-6 z-10 bg-card/80 backdrop-blur-md border border-border p-4 rounded-2xl shadow-2xl max-w-sm pointer-events-none">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/20 p-2 rounded-lg text-primary">
              <Share2 size={20} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Dependency Graph</h2>
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Nodes are files, arrows are imports. Click to explore symbols.
          </p>
        </div>

        <div className="absolute top-6 right-6 z-10 flex gap-2">
          <button 
            onClick={handleScanCycles}
            disabled={isScanning || data.nodes.length === 0}
            className={cn(
              "bg-card/80 backdrop-blur-md border border-border p-3 rounded-xl transition-all shadow-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest",
              cycles.length > 0 ? "text-red-400 border-red-500/30" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isScanning ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {cycles.length > 0 ? `${cycles.length} Cycles` : 'Scan Cycles'}
          </button>
          <button 
            onClick={() => fgRef.current?.zoomToFit(400)}
            className="bg-card/80 backdrop-blur-md border border-border p-3 rounded-xl text-muted-foreground hover:text-foreground transition-all shadow-xl"
          >
            <Maximize2 size={20} />
          </button>
        </div>

        <div className="h-full w-full">
          {data?.nodes?.length > 0 ? (
            <ForceGraph2D
              ref={fgRef}
              graphData={data}
              nodeLabel="id"
              nodeColor={(node: any) => {
                const isCycleNode = cycles.some(c => c.includes(node.id));
                if (isCycleNode) return '#ef4444';
                if (highlightNodes.size > 0 && !highlightNodes.has(node.id)) return '#ffffff10';
                return getGroupColor(node.group);
              }}
              nodeRelSize={6}
              linkColor={() => '#ffffff20'}
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              onNodeClick={handleNodeClick}
              onBackgroundClick={clearHighlight}
              nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                const isSelected = selectedNode?.id === node.id;
                const label = node.label;
                const fontSize = (isSelected ? 14 : 12) / globalScale;
                ctx.font = `${isSelected ? 'bold ' : ''}${fontSize}px Inter, sans-serif`;
                const textWidth = ctx.measureText(label).width;
                const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                if (highlightNodes.size > 0 && !highlightNodes.has(node.id)) ctx.globalAlpha = 0.1;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const isCycleNode = cycles.some(c => c.includes(node.id));
                ctx.fillStyle = isSelected ? '#ffffff' : (isCycleNode ? '#ef4444' : getGroupColor(node.group));
                ctx.fillText(label, node.x, node.y);

                if (isSelected) {
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 2 / globalScale;
                  ctx.strokeRect(node.x - bckgDimensions[0] / 2 - 2, node.y - bckgDimensions[1] / 2 - 2, bckgDimensions[0] + 4, bckgDimensions[1] + 4);
                }
                ctx.globalAlpha = 1.0;
              }}
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center opacity-30">
              <Share2 size={64} strokeWidth={1} />
              <p className="mt-4 font-bold">No dependencies indexed yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}