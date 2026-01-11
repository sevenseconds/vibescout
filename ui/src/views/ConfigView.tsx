import { useState, useEffect } from 'react';
import { Bot, Save, Shield, Loader2, Cpu, Key, Globe, Server, Check, AlertCircle, Eye, EyeOff, Settings, MessagesSquare } from 'lucide-react';
import axios from 'axios';

interface Config {
  provider: string;
  llmProvider: string;
  dbProvider: string;
  embeddingModel: string;
  llmModel: string;
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

const EMBEDDING_MODELS: Record<string, string[]> = {
  local: [
    "Xenova/bge-small-en-v1.5",
    "Xenova/all-MiniLM-L6-v2",
    "Xenova/bge-base-en-v1.5",
    "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
  ],
  openai: [
    "text-embedding-3-small",
    "text-embedding-3-large",
    "text-embedding-ada-002"
  ],
  gemini: [
    "text-embedding-004"
  ],
  ollama: [
    "nomic-embed-text",
    "all-minilm",
    "mxbai-embed-large"
  ],
  cloudflare: [
    "@cf/baai/bge-small-en-v1.5",
    "@cf/baai/bge-base-en-v1.5",
    "@cf/baai/bge-large-en-v1.5"
  ],
  bedrock: [
    "amazon.titan-embed-text-v1"
  ],
  zai: [
    "embedding-2",
    "embedding-3"
  ],
  lmstudio: [
    "local-model"
  ]
};

const CHAT_MODELS: Record<string, string[]> = {
  local: [
    "Xenova/distilbart-cnn-6-6"
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo"
  ],
  gemini: [
    "gemini-1.5-pro",
    "gemini-1.5-flash"
  ],
  ollama: [
    "llama3",
    "mistral",
    "phi3",
    "gemma2"
  ],
  cloudflare: [
    "@cf/meta/llama-3-8b-instruct",
    "@cf/qwen/qwen1.5-7b-chat-awq"
  ],
  bedrock: [
    "anthropic.claude-3-sonnet-20240229-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0"
  ],
  zai: [
    "glm-4-plus",
    "glm-4-0520",
    "glm-4-air",
    "glm-4-air-x",
    "glm-4-flash",
    "codegeex-4"
  ],
  "zai-coding": [
    "glm-4.5",
    "glm-4.5-air",
    "glm-4.5-flash",
    "glm-4.5v",
    "glm-4.6",
    "glm-4.6v",
    "glm-4.7"
  ],
  lmstudio: [
    "local-model"
  ]
};

export default function ConfigView() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showKeys, setShowKeys] = useState(false);

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
    if (!config) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      await axios.post('/api/config', config);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: keyof Config, value: any) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : null);
  };

  const renderProviderFields = (providerType: string) => {
    if (!config) return null;

    switch (providerType) {
      case 'openai':
      case 'lmstudio':
        return (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Base URL</label>
              <div className="relative">
                <Globe className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                <input 
                  type="text" 
                  value={config.openaiBaseUrl}
                  onChange={(e) => updateConfig('openaiBaseUrl', e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            </div>
            {providerType === 'openai' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1 flex justify-between">
                  API Key
                  <button onClick={() => setShowKeys(!showKeys)} className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                    {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                    <span className="lowercase font-bold">{showKeys ? 'hide' : 'show'}</span>
                  </button>
                </label>
                <div className="relative">
                  <Key className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                  <input 
                    type={showKeys ? "text" : "password"}
                    value={config.openaiKey}
                    onChange={(e) => updateConfig('openaiKey', e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                    placeholder="sk-..."
                  />
                </div>
              </div>
            )}
          </>
        );
      case 'ollama':
        return (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Ollama URL</label>
            <div className="relative">
              <Globe className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
              <input 
                type="text" 
                value={config.ollamaUrl}
                onChange={(e) => updateConfig('ollamaUrl', e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                placeholder="http://localhost:11434"
              />
            </div>
          </div>
        );
      case 'gemini':
        return (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1 flex justify-between">
              Gemini API Key
              <button onClick={() => setShowKeys(!showKeys)} className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                <span className="lowercase font-bold">{showKeys ? 'hide' : 'show'}</span>
              </button>
            </label>
            <div className="relative">
              <Key className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
              <input 
                type={showKeys ? "text" : "password"}
                value={config.geminiKey}
                onChange={(e) => updateConfig('geminiKey', e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
              />
            </div>
          </div>
        );
      case 'zai':
      case 'zai-coding':
        return (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1 flex justify-between">
              Z.AI API Key
              <button onClick={() => setShowKeys(!showKeys)} className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                <span className="lowercase font-bold">{showKeys ? 'hide' : 'show'}</span>
              </button>
            </label>
            <div className="relative">
              <Key className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
              <input 
                type={showKeys ? "text" : "password"}
                value={config.zaiKey}
                onChange={(e) => updateConfig('zaiKey', e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
              />
            </div>
          </div>
        );
      case 'cloudflare':
        return (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Account ID</label>
              <input 
                type="text" 
                value={config.cloudflareAccountId}
                onChange={(e) => updateConfig('cloudflareAccountId', e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1 flex justify-between">
                API Token
                <button onClick={() => setShowKeys(!showKeys)} className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                  {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span className="lowercase font-bold">{showKeys ? 'hide' : 'show'}</span>
                </button>
              </label>
              <div className="relative">
                <Key className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                <input 
                  type={showKeys ? "text" : "password"}
                  value={config.cloudflareToken}
                  onChange={(e) => updateConfig('cloudflareToken', e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                />
              </div>
            </div>
          </>
        );
      case 'bedrock':
        return (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">AWS Region</label>
              <input 
                type="text" 
                value={config.awsRegion}
                onChange={(e) => updateConfig('awsRegion', e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                placeholder="us-east-1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">AWS Profile</label>
              <input 
                type="text" 
                value={config.awsProfile}
                onChange={(e) => updateConfig('awsProfile', e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                placeholder="default"
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto w-full overflow-y-auto pb-20">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">System Settings</h2>
          <p className="text-muted-foreground font-medium text-sm">Configure your AI providers, database, and system preferences.</p>
        </div>
        
        {saveStatus === 'success' && (
          <div className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-500/20 animate-in fade-in slide-in-from-top-4">
            <Check size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Settings Saved</span>
          </div>
        )}
        {saveStatus === 'error' && (
          <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-xl flex items-center gap-2 border border-destructive/20 animate-in fade-in slide-in-from-top-4">
            <AlertCircle size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Save Failed</span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Embedding Provider Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot size={20} className="text-primary" />
              <h3 className="font-bold tracking-tight text-lg text-foreground">Embedding Provider</h3>
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
                  onChange={(e) => updateConfig('provider', e.target.value)}
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
                <div className="relative group">
                  <Cpu className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                  <input 
                    type="text" 
                    value={config?.embeddingModel}
                    onChange={(e) => updateConfig('embeddingModel', e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl pl-12 pr-10 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                    list="embedding-model-suggestions"
                  />
                  <datalist id="embedding-model-suggestions">
                    {config && EMBEDDING_MODELS[config.provider]?.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <div className="absolute right-4 top-3.5">
                     <Settings size={16} className="text-muted-foreground/50" />
                  </div>
                </div>
                {config && EMBEDDING_MODELS[config.provider] && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {EMBEDDING_MODELS[config.provider].map(m => (
                      <button 
                        key={m}
                        onClick={() => updateConfig('embeddingModel', m)}
                        className={`text-[10px] px-2 py-1 rounded-md border transition-all ${config.embeddingModel === m ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary border-border text-muted-foreground hover:border-muted-foreground'}`}
                      >
                        {m.split('/').pop()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-border/50">
              {config && renderProviderFields(config.provider)}
            </div>
          </div>
        </section>

        {/* LLM Provider Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessagesSquare size={20} className="text-primary" />
              <h3 className="font-bold tracking-tight text-lg text-foreground">LLM Provider</h3>
            </div>
            <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              {config?.llmProvider || config?.provider}
            </div>
          </div>
          
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Selected Provider</label>
                <select 
                  value={config?.llmProvider || config?.provider} 
                  onChange={(e) => updateConfig('llmProvider', e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-bold transition-all appearance-none"
                >
                  <option value="local">Local (Transformers.js)</option>
                  <option value="ollama">Ollama</option>
                  <option value="lmstudio">LM Studio</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="zai">Z.AI (BigModel.cn)</option>
                  <option value="zai-coding">Z.AI Coding Plan</option>
                  <option value="bedrock">AWS Bedrock</option>
                  <option value="cloudflare">Cloudflare Workers AI</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Active LLM Model</label>
                <div className="relative group">
                  <Cpu className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                  <input 
                    type="text" 
                    value={config?.llmModel || config?.embeddingModel}
                    onChange={(e) => updateConfig('llmModel', e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl pl-12 pr-10 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                    list="llm-model-suggestions"
                  />
                  <datalist id="llm-model-suggestions">
                    {config && CHAT_MODELS[config.llmProvider || config.provider]?.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <div className="absolute right-4 top-3.5">
                     <Settings size={16} className="text-muted-foreground/50" />
                  </div>
                </div>
                {config && CHAT_MODELS[config.llmProvider || config.provider] && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {CHAT_MODELS[config.llmProvider || config.provider].map(m => (
                      <button 
                        key={m}
                        onClick={() => updateConfig('llmModel', m)}
                        className={`text-[10px] px-2 py-1 rounded-md border transition-all ${(config.llmModel || config.embeddingModel) === m ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary border-border text-muted-foreground hover:border-muted-foreground'}`}
                      >
                        {m.split('/').pop()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-border/50">
              {config && renderProviderFields(config.llmProvider || config.provider)}
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
                  onChange={(e) => updateConfig('dbProvider', e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-bold transition-all appearance-none"
                >
                  <option value="local">Local (LanceDB)</option>
                  <option value="cloudflare">Cloudflare Vectorize</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Server Port</label>
                <div className="relative">
                  <Server className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                  <input 
                    type="number" 
                    value={config?.port}
                    onChange={(e) => updateConfig('port', parseInt(e.target.value))}
                    className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono transition-all text-foreground"
                  />
                </div>
              </div>
            </div>

            {config?.dbProvider === 'cloudflare' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-border/50">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Vectorize Index Name</label>
                  <input 
                    type="text" 
                    value={config.cloudflareVectorizeIndex}
                    onChange={(e) => updateConfig('cloudflareVectorizeIndex', e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button 
            disabled={saving}
            onClick={handleSave}
            className="bg-primary text-primary-foreground px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:opacity-90 transition-all shadow-xl shadow-primary/20 group disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} className="group-hover:scale-110 transition-transform" />}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}