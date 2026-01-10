import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('/api/chat', { query: input });
      const assistantMessage: Message = { role: 'assistant', content: response.data.response };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error while processing your request.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto w-full p-6 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl text-primary shadow-inner">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Code Assistant</h2>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Powered by RAG</p>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-6 pr-4 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-40 grayscale pointer-events-none">
            <Bot size={80} strokeWidth={1} />
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold">Ask about your code</h3>
              <p className="max-w-xs text-sm font-medium">Example: "How does the indexing flow work?" or "Where is the database path defined?"</p>
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
            <div className="space-y-2 flex-1">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/60">
                {msg.role === 'assistant' ? 'Assistant' : 'You'}
              </p>
              <div className="text-base leading-relaxed text-foreground whitespace-pre-wrap font-medium">
                {msg.content}
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
      <div className="pt-4">
        <div className="relative group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything about your projects..."
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
          Local Intelligence • No data leaves your machine
        </p>
      </div>
    </div>
  );
}
