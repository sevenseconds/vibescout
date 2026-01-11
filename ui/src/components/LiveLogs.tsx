import { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export default function LiveLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const response = await axios.get('/api/logs');
      setLogs(response.data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'DEBUG': return 'text-muted-foreground/50';
      case 'INFO': return 'text-blue-400';
      case 'WARN': return 'text-amber-400';
      case 'ERROR': return 'text-red-400';
      default: return 'text-foreground';
    }
  };

  return (
    <div className={cn(
      "w-full bg-card border-t border-border shrink-0 transition-all duration-300 flex flex-col",
      isOpen ? "h-80" : "h-12"
    )}>
      {/* Header / Toggle */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="h-12 bg-secondary/50 border-b border-border/10 flex items-center justify-between px-6 cursor-pointer hover:bg-secondary transition-colors shrink-0"
      >
        <div className="flex items-center gap-3">
          <Terminal size={18} className={cn(isOpen ? "text-primary" : "text-muted-foreground")} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Live System Activity</span>
          {logs.length > 0 && !isOpen && (
            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold animate-pulse">
              {logs[logs.length - 1].message.substring(0, 50)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </div>
      </div>

      {/* Logs Area */}
      <div 
        ref={scrollRef}
        className={cn(
          "h-full bg-[#0d0d0d] overflow-y-auto p-4 font-mono text-[11px] space-y-1 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-colors group">
            <span className="text-muted-foreground/30 shrink-0 select-none">
              {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
            </span>
            <span className={cn("font-bold shrink-0 w-12", getLevelColor(log.level))}>
              {log.level}
            </span>
            <span className="text-muted-foreground group-hover:text-foreground transition-colors break-all">
              {log.message}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="h-full flex items-center justify-center text-muted-foreground italic">
            Waiting for activity...
          </div>
        )}
      </div>
    </div>
  );
}
