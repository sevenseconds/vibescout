import { useState, useEffect } from 'react';
import { MessageSquare, Save, RefreshCw, Info, Check, Plus, Trash2, Zap, Layers } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SummarizeTemplate {
  id: string;
  name: string;
  text: string;
}

interface Prompts {
  summarizeTemplates: SummarizeTemplate[];
  activeSummarizeId: string;
  chunkSummarize: string;
  bestQuestion: string;
}

export default function PromptsView() {
  const [prompts, setPrompts] = useState<Prompts | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        const response = await axios.get('/api/config');
        const data = response.data.prompts || {};
        setPrompts({
          summarizeTemplates: data.summarizeTemplates || [],
          activeSummarizeId: data.activeSummarizeId || '',
          chunkSummarize: data.chunkSummarize || '',
          bestQuestion: data.bestQuestion || ''
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPrompts();
  }, []);

  const handleSave = async () => {
    if (!prompts) return;
    setSaving(true);
    try {
      const configRes = await axios.get('/api/config');
      const newConfig = { ...configRes.data, prompts };
      await axios.post('/api/config', newConfig);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = () => {
    if (!prompts) return;
    const newId = Math.random().toString(36).substring(7);
    const newTemplate: SummarizeTemplate = {
      id: newId,
      name: 'New Template',
      text: 'Summarize this: {{code}}'
    };
    setPrompts({
      ...prompts,
      summarizeTemplates: [...prompts.summarizeTemplates, newTemplate],
      activeSummarizeId: prompts.activeSummarizeId || newId
    });
  };

  const removeTemplate = (id: string) => {
    if (!prompts || prompts.summarizeTemplates.length <= 1) return;
    const filtered = prompts.summarizeTemplates.filter(t => t.id !== id);
    setPrompts({
      ...prompts,
      summarizeTemplates: filtered,
      activeSummarizeId: prompts.activeSummarizeId === id ? filtered[0].id : prompts.activeSummarizeId
    });
  };

  const updateTemplate = (id: string, updates: Partial<SummarizeTemplate>) => {
    if (!prompts) return;
    setPrompts({
      ...prompts,
      summarizeTemplates: prompts.summarizeTemplates.map(t => t.id === id ? { ...t, ...updates } : t)
    });
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <RefreshCw className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  const activeTemplate = prompts?.summarizeTemplates.find(t => t.id === prompts.activeSummarizeId);

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto w-full overflow-y-auto pb-20">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Prompt Management</h2>
          <p className="text-muted-foreground font-medium text-sm">Customize how the AI analyzes your code and generates questions.</p>
        </div>
        
        <div className="flex items-center gap-4">
          {saveStatus === 'success' && (
            <div className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-500/20 animate-in fade-in slide-in-from-top-4">
              <Check size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Templates Saved</span>
            </div>
          )}
          <button 
            disabled={saving}
            onClick={handleSave}
            className="bg-primary text-primary-foreground px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:opacity-90 transition-all shadow-xl shadow-primary/20 group disabled:opacity-50"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} className="group-hover:scale-110 transition-transform" />}
            Save All Changes
          </button>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Info size={18} />
          <h4 className="text-xs font-black uppercase tracking-widest">Available Variables</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Variable badge="{{code}}" desc="The snippet of code" />
          <Variable badge="{{fileName}}" desc="Name of the file" />
          <Variable badge="{{projectName}}" desc="Current project name" />
          <Variable badge="{{parentName}}" desc="Parent scope (for chunks)" />
          <Variable badge="{{query}}" desc="The user's search query" />
          <Variable badge="{{context}}" desc="Search results context" />
          <Variable badge="{{date}}" desc="Current date" />
          <Variable badge="{{time}}" desc="Current time" />
        </div>
      </div>

      <div className="space-y-10">
        {/* Summarization Template Library */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-foreground">
              <Layers size={20} className="text-primary" />
              <h3 className="font-bold text-xl tracking-tight">Summarization Library</h3>
            </div>
            <button 
              onClick={addTemplate}
              className="flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-secondary/80 transition-all"
            >
              <Plus size={14} /> Add Template
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {prompts?.summarizeTemplates.map(t => (
              <div 
                key={t.id}
                onClick={() => setPrompts({ ...prompts, activeSummarizeId: t.id })}
                className={cn(
                  "p-4 rounded-2xl border-2 cursor-pointer transition-all relative group",
                  prompts.activeSummarizeId === t.id 
                    ? "bg-primary/5 border-primary shadow-lg shadow-primary/5" 
                    : "bg-card border-border hover:border-border/80"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                    prompts.activeSummarizeId === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  )}>
                    {prompts.activeSummarizeId === t.id ? 'Active' : 'Draft'}
                  </span>
                  {prompts.summarizeTemplates.length > 1 && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeTemplate(t.id); }}
                      className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <input 
                  value={t.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateTemplate(t.id, { name: e.target.value })}
                  className="bg-transparent font-bold text-sm w-full focus:outline-none focus:text-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 italic">{t.text}</p>
              </div>
            ))}
          </div>

          {activeTemplate && (
            <div className="animate-in slide-in-from-top-2 duration-300 pt-2">
              <PromptEditor 
                title={`Editing: ${activeTemplate.name}`}
                description="This template is used during full file and function indexing."
                value={activeTemplate.text}
                onChange={(val) => updateTemplate(activeTemplate.id, { text: val })}
              />
            </div>
          )}
        </section>

        {/* Chunk Summarizer */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2 text-foreground">
            <Zap size={20} className="text-primary" />
            <h3 className="font-bold text-xl tracking-tight">Chunk Indexer</h3>
          </div>
          <PromptEditor 
            title="Small Logic Blocks"
            description="Used for smaller code chunks within functions to provide granular context."
            value={prompts?.chunkSummarize || ''}
            onChange={(val) => setPrompts(prev => prev ? {...prev, chunkSummarize: val} : null)}
          />
        </section>

        {/* Best Question */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2 text-foreground">
            <MessageSquare size={20} className="text-primary" />
            <h3 className="font-bold text-xl tracking-tight">Smart Question</h3>
          </div>
          <PromptEditor 
            title="Insight Generator"
            description="Synthesizes search results into a starting chat prompt."
            value={prompts?.bestQuestion || ''}
            onChange={(val) => setPrompts(prev => prev ? {...prev, bestQuestion: val} : null)}
          />
        </section>
      </div>
    </div>
  );
}

function Variable({ badge, desc }: { badge: string, desc: string }) {
  return (
    <div className="space-y-1">
      <code className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">{badge}</code>
      <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">{desc}</p>
    </div>
  );
}

function PromptEditor({ title, description, value, onChange }: { title: string, description: string, value: string, onChange: (val: string) => void }) {
  return (
    <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
      <div className="p-6 bg-secondary/50 border-b border-border flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-xl text-primary">
          <MessageSquare size={18} />
        </div>
        <div>
          <h3 className="font-bold tracking-tight text-base text-foreground">{title}</h3>
          <p className="text-[10px] text-muted-foreground font-medium">{description}</p>
        </div>
      </div>
      <div className="p-6">
        <textarea 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-40 bg-secondary/30 border border-border rounded-2xl p-4 font-mono text-xs focus:outline-none focus:border-primary transition-all resize-none leading-relaxed"
          placeholder="Enter your prompt template here..."
        />
      </div>
    </section>
  );
}

