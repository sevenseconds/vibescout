import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Trash2, Filter, X, Bug } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import MarkdownRenderer from '../components/MarkdownRenderer';
import DebugPanel from '../components/DebugPanel';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  
  // Filters
  const [projectName, setProjectName] = useState('');
  const [collection, setCollection] = useState('');
  const [fileType, setFileType] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    try {
      const response = await axios.get('/api/chat');
      setMessages(response.data);
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('/api/chat', { 
        query: currentInput,
        projectName: projectName || undefined,
        collection: collection || undefined,
        fileType: fileType || undefined
      });
      const assistantMessage: Message = { role: 'assistant', content: response.data.response };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error while processing your request.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear the conversation history?')) return;
    try {
      await axios.delete('/api/chat');
      setMessages([]);
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  };

  const clearFilters = () => {
    setProjectName('');
    setCollection('');
    setFileType('');
  };

  if (initialLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex flex-col flex-1 max-w-5xl mx-auto w-full p-6 space-y-4 overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-xl text-primary shadow-inner">
              <Sparkles size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Code Assistant</h2>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Persistent Conversation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border",
                showDebug 
                  ? "bg-primary/10 border-primary/30 text-primary" 
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
              title="Inspect AI Requests"
            >
              <Bug size={14} />
            </button>
            {messages.length > 0 && (
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border",
                  showFilters || projectName || collection || fileType 
                    ? "bg-primary/10 border-primary/30 text-primary" 
                    : "text-muted-foreground hover:text-foreground border-transparent"
                )}
              >
                <Filter size={14} /> Filters
              </button>
            )}
            {messages.length > 0 && (
              <button 
                onClick={handleClear}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              >
                <Trash2 size={14} /> Clear History
              </button>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-6 pr-4 scroll-smooth pb-4"
        >
          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-40 grayscale pointer-events-none">
              <Bot size={80} strokeWidth={1} />
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold">Ask about your code</h3>
                <p className="max-w-xs text-sm font-medium">I remember our previous turns, so feel free to ask follow-up questions!</p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={cn(
                "flex gap-4 p-6 rounded-3xl transition-all animate-in fade-in slide-in-from-bottom-2 duration-300",
                msg.role === 'assistant' ? "bg-card border border-border shadow-sm" : "bg-primary/5 border border-primary/10"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg",
                msg.role === 'assistant' ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              )}>
                {msg.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
              </div>
              <div className="space-y-2 flex-1 overflow-hidden">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/60">
                  {msg.role === 'assistant' ? 'Assistant' : 'You'}
                </p>
                <div className="text-base leading-relaxed text-foreground font-medium break-words">
                  <MarkdownRenderer content={msg.content} />
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-4 p-6 bg-card border border-border rounded-3xl shadow-sm animate-pulse">
              <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
              <div className="space-y-3 flex-1">
                <div className="h-2 w-24 bg-muted rounded-full" />
                <div className="space-y-2">
                  <div className="h-3 w-full bg-muted rounded-full" />
                  <div className="h-3 w-3/4 bg-muted rounded-full" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="pt-2 space-y-4">
          {showFilters && (
            <div className="bg-card border border-border p-4 rounded-2xl shadow-lg animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scope Filters</h3>
                {(projectName || collection || fileType) && (
                  <button 
                    onClick={clearFilters}
                    className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline flex items-center gap-1"
                  >
                    <X size={10} /> Clear All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input 
                  type="text" 
                  placeholder="Project Name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-all"
                />
                <input 
                  type="text" 
                  placeholder="Collection"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                  className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-all"
                />
                <input 
                  type="text" 
                  placeholder="File Extension (e.g. .ts)"
                  value={fileType}
                  onChange={(e) => setFileType(e.target.value)}
                  className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary font-mono transition-all"
                />
              </div>
            </div>
          )}
          <div className="relative group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a follow-up or a new question..."
              className="w-full bg-card border-2 border-border rounded-2xl py-5 pl-6 pr-16 text-lg focus:outline-none focus:border-primary transition-all shadow-xl shadow-black/20 font-medium"
            />
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="absolute right-3 inset-y-3 bg-primary text-primary-foreground p-3 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
            >
              <Send size={20} strokeWidth={2.5} />
            </button>
          </div>
          <p className="text-[10px] text-center mt-4 text-muted-foreground font-bold uppercase tracking-[0.2em]">
            Persistent Context • Local Q&A
          </p>
        </div>
      </div>
      {showDebug && <DebugPanel />}
    </div>
  );
}