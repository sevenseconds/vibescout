import { useState, useEffect, useRef } from 'react';
// @ts-ignore
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';
import { Share2, Loader2, Maximize2 } from 'lucide-react';

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

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col relative bg-[#0a0a0a]">
      {/* Header Info */}
      <div className="absolute top-6 left-6 z-10 bg-card/80 backdrop-blur-md border border-border p-4 rounded-2xl shadow-2xl max-w-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-primary/20 p-2 rounded-lg text-primary">
            <Share2 size={20} />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Dependency Graph</h2>
        </div>
        <p className="text-xs text-muted-foreground font-medium leading-relaxed">
          Visualizing internal file dependencies. Nodes are files, arrows represent imports. 
          Color grouped by project.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(groupColors.current).map(([group, color]) => (
            <div key={group} className="flex items-center gap-1.5 px-2 py-1 bg-secondary/50 rounded-md border border-border/50">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{group}</span>
            </div>
          ))}
        </div>
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
      <div className="flex-1">
        {data.nodes.length > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            graphData={data}
            nodeLabel="id"
            nodeColor={(node: any) => getGroupColor(node.group)}
            nodeRelSize={6}
            linkColor={() => '#ffffff20'}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={1}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label = node.label;
              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px Inter, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

              ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
              ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = getGroupColor(node.group);
              ctx.fillText(label, node.x, node.y);

              node.__bckgDimensions = bckgDimensions; // to use in nodePointerAreaPaint
            }}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              ctx.fillStyle = color;
              const bckgDimensions = node.__bckgDimensions;
              bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
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
  );
}