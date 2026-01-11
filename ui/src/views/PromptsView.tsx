import { useState, useEffect } from 'react';
import { MessageSquare, Save, RefreshCw, Info, Check } from 'lucide-react';
import axios from 'axios';

interface Prompts {
  summarize: string;
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
        setPrompts(response.data.prompts || { summarize: '', bestQuestion: '' });
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

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <RefreshCw className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto w-full overflow-y-auto pb-20">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Prompt Management</h2>
          <p className="text-muted-foreground font-medium text-sm">Customize how the AI analyzes your code and generates questions.</p>
        </div>
        
        {saveStatus === 'success' && (
          <div className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-500/20 animate-in fade-in slide-in-from-top-4">
            <Check size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Prompts Saved</span>
          </div>
        )}
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
          <Variable badge="{{query}}" desc="The user's search query" />
          <Variable badge="{{context}}" desc="Search results context" />
          <Variable badge="{{date}}" desc="Current date" />
          <Variable badge="{{time}}" desc="Current time" />
        </div>
      </div>

      <div className="space-y-6">
        <PromptEditor 
          title="Summarization Template"
          description="Used during indexing to create searchable context for code blocks."
          value={prompts?.summarize || ''}
          onChange={(val) => setPrompts(prev => prev ? {...prev, summarize: val} : null)}
        />

        <PromptEditor 
          title="Best Question Template"
          description="Used in Search view to synthesize results into a starting chat prompt."
          value={prompts?.bestQuestion || ''}
          onChange={(val) => setPrompts(prev => prev ? {...prev, bestQuestion: val} : null)}
        />

        <div className="flex justify-end pt-4">
          <button 
            disabled={saving}
            onClick={handleSave}
            className="bg-primary text-primary-foreground px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:opacity-90 transition-all shadow-xl shadow-primary/20 group disabled:opacity-50"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} className="group-hover:scale-110 transition-transform" />}
            Save Templates
          </button>
        </div>
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
        <MessageSquare size={20} className="text-primary" />
        <div>
          <h3 className="font-bold tracking-tight text-lg text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground font-medium">{description}</p>
        </div>
      </div>
      <div className="p-6">
        <textarea 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-48 bg-secondary/30 border border-border rounded-2xl p-4 font-mono text-xs focus:outline-none focus:border-primary transition-all resize-none leading-relaxed"
          placeholder="Enter your prompt template here..."
        />
      </div>
    </section>
  );
}
