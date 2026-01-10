import { useState, useEffect } from 'react';
import { Bot, Save, Shield, Loader2, Cpu } from 'lucide-react';
import axios from 'axios';

interface Config {
  provider: string;
  dbProvider: string;
  embeddingModel: string;
  modelsPath: string;
  ollamaUrl: string;
  openaiKey: string;
  openaiBaseUrl: string;
  zaiKey: string;
  geminiKey: string;
  cloudflareAccountId: string;
  cloudflareToken: string;
  cloudflareVectorizeIndex: string;
  awsRegion: string;
  awsProfile: string;
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

  const handleSave = async () => {
    alert("In-UI saving will be implemented soon. Please use 'vibescout config' in terminal for now.");
  };

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto w-full overflow-y-auto pb-20">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">System Settings</h2>
        <p className="text-muted-foreground font-medium text-sm">Configure your AI providers, database, and system preferences.</p>
      </div>

      <div className="space-y-6">
        {/* AI Provider Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot size={20} className="text-primary" />
              <h3 className="font-bold tracking-tight text-lg text-foreground">AI Provider</h3>
            </div>
            <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              {config?.provider}
            </div>
          </div>
          
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Selected Provider</label>
                <select 
                  value={config?.provider} 
                  onChange={(e) => setConfig(prev => prev ? {...prev, provider: e.target.value} : null)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-bold transition-all appearance-none"
                >
                  <option value="local">Local (Transformers.js)</option>
                  <option value="ollama">Ollama</option>
                  <option value="lmstudio">LM Studio</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="zai">Z.AI (BigModel.cn)</option>
                  <option value="bedrock">AWS Bedrock</option>
                  <option value="cloudflare">Cloudflare Workers AI</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Active Model</label>
                <div className="relative">
                  <Cpu className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                  <input 
                    type="text" 
                    value={config?.embeddingModel}
                    onChange={(e) => setConfig(prev => prev ? {...prev, embeddingModel: e.target.value} : null)}
                    className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Database Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield size={20} className="text-primary" />
              <h3 className="font-bold tracking-tight text-lg text-foreground">Vector Database</h3>
            </div>
            <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              {config?.dbProvider}
            </div>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">DB Provider</label>
                <select 
                  value={config?.dbProvider}
                  onChange={(e) => setConfig(prev => prev ? {...prev, dbProvider: e.target.value} : null)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-bold transition-all appearance-none"
                >
                  <option value="local">Local (LanceDB)</option>
                  <option value="cloudflare">Cloudflare Vectorize</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Server Port</label>
                <input 
                  type="number" 
                  value={config?.port}
                  onChange={(e) => setConfig(prev => prev ? {...prev, port: parseInt(e.target.value)} : null)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono transition-all text-foreground"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave}
            className="bg-primary text-primary-foreground px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:opacity-90 transition-all shadow-xl shadow-primary/20 group"
          >
            <Save size={18} className="group-hover:scale-110 transition-transform" />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}