import { useState, useEffect, useRef, useMemo } from 'react';
// @ts-ignore
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';
import { Share2, Loader2, Maximize2, X, ExternalLink, Box, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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

  const fgRef = useRef<any>(null);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const response = await axios.get('/api/graph');
        setData(response.data);
      } catch (err) {
        console.error(err);
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
    
    // Highlight logic
    const neighbors = new Set();
    const links = new Set();
    
    data.links.forEach(link => {
      if (link.source === node.id || (link.source as any).id === node.id) {
        neighbors.add(link.target);
        links.add(link);
      }
      if (link.target === node.id || (link.target as any).id === node.id) {
        neighbors.add(link.source);
        links.add(link);
      }
    });

    neighbors.add(node);
    setHighlightNodes(neighbors);
    
    // Center view
    fgRef.current.centerAt(node.x, node.y, 400);
  };

  const clearHighlight = () => {
    setSelectedNode(null);
    setHighlightNodes(new Set());
  };

  const dependents = useMemo(() => {
    if (!selectedNode) return [];
    return data.links
      .filter(l => (l.target === selectedNode.id || (l.target as any).id === selectedNode.id))
      .map(l => typeof l.source === 'string' ? l.source : (l.source as any).id);
  }, [selectedNode, data]);

  const dependencies = useMemo(() => {
    if (!selectedNode) return [];
    return data.links
      .filter(l => (l.source === selectedNode.id || (l.source as any).id === selectedNode.id))
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
      {/* Side Panel (Symbol Intelligence) */}
      <div className={cn(
        "absolute top-0 right-0 h-full w-96 bg-card border-l border-border z-20 transition-transform duration-300 transform shadow-2xl overflow-y-auto",
        selectedNode ? "translate-x-0" : "translate-x-full"
      )}>
        {selectedNode && (
          <div className="p-6 space-y-8 pb-20">
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
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20">
                <ExternalLink size={16} /> Open in Editor
              </button>
            </div>

            <div className="space-y-6">
              {/* Dependents */}
              <div className="space-y-3">
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
                  {dependents.length === 0 && <p className="text-[11px] text-muted-foreground italic px-2">No incoming dependencies.</p>}
                </div>
              </div>

              {/* Dependencies */}
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
                  {dependencies.length === 0 && <p className="text-[11px] text-muted-foreground italic px-2">No outgoing dependencies.</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 relative">
        {/* Header Info */}
        <div className="absolute top-6 left-6 z-10 bg-card/80 backdrop-blur-md border border-border p-4 rounded-2xl shadow-2xl max-w-sm pointer-events-none">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/20 p-2 rounded-lg text-primary">
              <Share2 size={20} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Dependency Graph</h2>
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Nodes are files, arrows represent imports. 
            Click to explore deep symbol intelligence.
          </p>
        </div>

        <div className="absolute top-6 right-6 z-10 flex gap-2">
          <button 
            onClick={() => fgRef.current?.zoomToFit(400)}
            className="bg-card/80 backdrop-blur-md border border-border p-3 rounded-xl text-muted-foreground hover:text-foreground transition-all shadow-xl"
            title="Zoom to Fit"
          >
            <Maximize2 size={20} />
          </button>
        </div>

        {/* Graph Area */}
        <div className="h-full w-full">
          {data.nodes.length > 0 ? (
            <ForceGraph2D
              ref={fgRef}
              graphData={data}
              nodeLabel="id"
              nodeColor={(node: any) => {
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
                const isHighlighted = highlightNodes.has(node.id);
                const shouldDim = highlightNodes.size > 0 && !isHighlighted;

                const label = node.label;
                const fontSize = (isSelected ? 14 : 12) / globalScale;
                ctx.font = `${isSelected ? 'bold ' : ''}${fontSize}px Inter, sans-serif`;
                const textWidth = ctx.measureText(label).width;
                const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                if (shouldDim) {
                  ctx.globalAlpha = 0.1;
                }

                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isSelected ? '#ffffff' : getGroupColor(node.group);
                ctx.fillText(label, node.x, node.y);

                if (isSelected) {
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 2 / globalScale;
                  ctx.strokeRect(node.x - bckgDimensions[0] / 2 - 2, node.y - bckgDimensions[1] / 2 - 2, bckgDimensions[0] + 4, bckgDimensions[1] + 4);
                }

                ctx.globalAlpha = 1.0;
                node.__bckgDimensions = bckgDimensions;
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
