import { useState, useEffect } from 'react';
import { Bot, Save, Shield, Loader2 } from 'lucide-react';
import axios from 'axios';

interface Config {
  provider: string;
  dbProvider: string;
  embeddingModel: string;
  modelsPath: string;
  port: number;
  summarize: boolean;
  verbose: boolean;
}

export default function ConfigView() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get('/api/config');
        setConfig(response.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
        <p className="text-muted-foreground font-medium">Configure your AI providers, database, and system preferences.</p>
      </div>

      <div className="space-y-6">
        {/* Provider Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 bg-secondary/50 border-b border-border flex items-center gap-3">
            <Bot size={20} className="text-primary" />
            <h3 className="font-bold tracking-tight text-lg">AI Provider</h3>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Selected Provider</label>
                <select 
                  value={config?.provider} 
                  onChange={(e) => setConfig(prev => prev ? {...prev, provider: e.target.value} : null)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium transition-all appearance-none"
                >
                  <option value="local">Local (Transformers.js)</option>
                  <option value="ollama">Ollama</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="cloudflare">Cloudflare Workers AI</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Model Name</label>
                <input 
                  type="text" 
                  value={config?.embeddingModel}
                  onChange={(e) => setConfig(prev => prev ? {...prev, embeddingModel: e.target.value} : null)}
                  placeholder="Xenova/bge-small-en-v1.5" 
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium transition-all"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Database Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 bg-secondary/50 border-b border-border flex items-center gap-3">
            <Shield size={20} className="text-primary" />
            <h3 className="font-bold tracking-tight text-lg">Vector Database</h3>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">DB Provider</label>
                <select 
                  value={config?.dbProvider}
                  onChange={(e) => setConfig(prev => prev ? {...prev, dbProvider: e.target.value} : null)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium transition-all appearance-none"
                >
                  <option value="local">Local (LanceDB)</option>
                  <option value="cloudflare">Cloudflare Vectorize</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Server Port</label>
                <input 
                  type="number" 
                  value={config?.port}
                  onChange={(e) => setConfig(prev => prev ? {...prev, port: parseInt(e.target.value)} : null)}
                  placeholder="3000" 
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-medium transition-all"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button className="bg-primary text-primary-foreground px-8 py-3.5 rounded-2xl font-bold flex items-center gap-3 hover:opacity-90 transition-all shadow-xl shadow-primary/20">
            <Save size={20} />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}