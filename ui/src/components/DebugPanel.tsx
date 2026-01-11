import { useState, useEffect } from 'react';
import { Zap, X, Bug, ChevronRight, Trash2, Clock, Cpu } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DebugRequest {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  payload: any;
  response: any;
  error: string | null;
}

export default function DebugPanel() {
  const [requests, setRequests] = useState<DebugRequest[]>([]);
  const [selectedId, setSelectedNode] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      const response = await axios.get('/api/debug/requests');
      setRequests(response.data);
    } catch (err) {
      console.error('Failed to fetch debug requests:', err);
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleClear = async () => {
    try {
      await axios.delete('/api/debug/requests');
      setRequests([]);
      setSelectedNode(null);
    } catch (err) {
      console.error('Failed to clear debug requests:', err);
    }
  };

  const selectedRequest = requests.find(r => r.id === selectedId);

  return (
    <div className="flex h-full bg-[#0d0d0d] border-l border-border w-[500px] flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Bug size={18} className="text-primary" />
          <h3 className="text-xs font-black uppercase tracking-[0.2em]">AI Inspector</h3>
        </div>
        <button 
          onClick={handleClear}
          className="p-2 text-muted-foreground hover:text-red-400 transition-colors"
          title="Clear History"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Request List */}
        <div className={cn(
          "flex-col border-r border-border bg-black/20 overflow-y-auto transition-all",
          selectedId ? "w-40" : "w-full"
        )}>
          {requests.map((req) => (
            <div 
              key={req.id}
              onClick={() => setSelectedNode(req.id)}
              className={cn(
                "p-3 border-b border-border/50 cursor-pointer hover:bg-white/5 transition-all group",
                selectedId === req.id ? "bg-primary/10 border-l-2 border-l-primary" : ""
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                  req.error ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                )}>
                  {req.provider}
                </span>
                <span className="text-[9px] text-muted-foreground/50 font-mono">
                  {new Date(req.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground truncate group-hover:text-foreground">
                {req.model}
              </p>
            </div>
          ))}
          {requests.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center space-y-4 opacity-30">
              <Zap size={40} strokeWidth={1} />
              <p className="text-xs font-bold uppercase tracking-widest">No API activity yet</p>
            </div>
          )}
        </div>

        {/* Details View */}
        {selectedId && selectedRequest && (
          <div className="flex-1 flex flex-col overflow-hidden bg-card/30">
            <div className="p-4 border-b border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Request Details</h4>
                <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/40 p-2 rounded-lg border border-border/30">
                  <div className="flex items-center gap-1.5 mb-1 opacity-50">
                    <Clock size={10} />
                    <span className="text-[8px] font-black uppercase">Timestamp</span>
                  </div>
                  <p className="text-[10px] font-mono">{new Date(selectedRequest.timestamp).toLocaleString()}</p>
                </div>
                <div className="bg-black/40 p-2 rounded-lg border border-border/30">
                  <div className="flex items-center gap-1.5 mb-1 opacity-50">
                    <Cpu size={10} />
                    <span className="text-[8px] font-black uppercase">Model</span>
                  </div>
                  <p className="text-[10px] font-mono truncate">{selectedRequest.model}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
              {/* Payload */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <ChevronRight size={12} className="text-primary" /> Outgoing Payload
                </h5>
                <pre className="p-3 bg-black/60 rounded-xl border border-border/50 text-[10px] font-mono text-blue-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(selectedRequest.payload, null, 2)}
                </pre>
              </div>

              {/* Response */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <ChevronRight size={12} className="text-emerald-400" /> API Response
                </h5>
                {selectedRequest.error ? (
                  <pre className="p-3 bg-red-500/10 rounded-xl border border-red-500/30 text-[10px] font-mono text-red-400 overflow-x-auto whitespace-pre-wrap">
                    {selectedRequest.error}
                  </pre>
                ) : (
                  <pre className="p-3 bg-black/60 rounded-xl border border-border/50 text-[10px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {typeof selectedRequest.response === 'string' 
                      ? selectedRequest.response 
                      : JSON.stringify(selectedRequest.response, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
