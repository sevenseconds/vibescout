import { useState, useEffect } from 'react';
import { Bot, Save, Shield, Loader2, Cpu, Key, Globe, Server, Check, Eye, EyeOff, Settings, MessagesSquare, Zap, Plus, X, RefreshCw, Bug, FileCode } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import modelsData from '../models.json';
import DebugPanel from '../components/DebugPanel';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const EMBEDDING_MODELS: Record<string, string[]> = modelsData.embedding;
const CHAT_MODELS: Record<string, string[]> = modelsData.chat;

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
  offline: boolean;
  useReranker: boolean;
  embedFilePath?: "full" | "name";
  watchDirectories: string[] | null;
  fileTypes: Record<string, {
    extensions: string[];
    summarize: boolean;
    promptTemplate?: string;
    maxLength?: number;
    index?: boolean;
    description: string;
  }>;
  throttlingErrors: string[];
  gitIntegration?: {
    enabled: boolean;
    embedInVector: boolean;
    storeAsMetadata: boolean;
    churnWindow: number;
  };
}

export default function ConfigView() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showKeys, setShowKeys] = useState(false);
  const [newErrorPattern, setNewErrorPattern] = useState('');
  const [ollamaSyncing, setOllamaSyncing] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const fetchOllamaModels = async (url: string) => {
    try {
      const res = await axios.get(`/api/models/ollama?url=${encodeURIComponent(url)}`);
      setOllamaModels(res.data.map((m: any) => m.name));
    } catch (err) {
      console.error('Ollama models fetch failed:', err);
    }
  };

  const fetchData = async () => {
    try {
      const response = await axios.get('/api/config');
      setConfig(response.data);
      if (response.data.provider === 'ollama' || response.data.llmProvider === 'ollama') {
        fetchOllamaModels(response.data.ollamaUrl);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
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

  const addErrorPattern = () => {
    if (!newErrorPattern.trim() || !config) return;
    if (config.throttlingErrors.includes(newErrorPattern.trim())) return;
    updateConfig('throttlingErrors', [...config.throttlingErrors, newErrorPattern.trim()]);
    setNewErrorPattern('');
  };

  const removeErrorPattern = (pattern: string) => {
    if (!config) return;
    updateConfig('throttlingErrors', config.throttlingErrors.filter(p => p !== pattern));
  };

  const handleOllamaSync = async () => {
    if (!config?.ollamaUrl) return;
    setOllamaSyncing(true);
    try {
      const res = await axios.get(`/api/models/ollama?url=${encodeURIComponent(config.ollamaUrl)}`);
      const modelNames = res.data.map((m: any) => m.name);
      setOllamaModels(modelNames);
      alert(`Ollama Sync Success!\n\nAvailable models: ${modelNames.join(', ')}`);
    } catch (err) {
      console.error(err);
      alert('Failed to connect to Ollama. Make sure it is running.');
    } finally {
      setOllamaSyncing(false);
    }
  };

  const handleTestEmbedding = async () => {
    if (!config) return;
    setTestingEmbedding(true);
    try {
      const res = await axios.post('/api/test/embedding', config);
      alert(`Embedding Test: ${res.data.message}\n\nConfiguration is valid and has been auto-saved.`);
      await handleSave();
    } catch (err: any) {
      alert(`Embedding Test Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setTestingEmbedding(false);
    }
  };

  const handleTestLLM = async () => {
    if (!config) return;
    setTestingLLM(true);
    try {
      const res = await axios.post('/api/test/llm', config);
      alert(`LLM Test: ${res.data.message}\n\nConfiguration is valid and has been auto-saved.`);
      await handleSave();
    } catch (err: any) {
      alert(`LLM Test Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setTestingLLM(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

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
                <input type="text" value={config.openaiBaseUrl} onChange={(e) => updateConfig('openaiBaseUrl', e.target.value)} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" placeholder="https://api.openai.com/v1" />
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
                  <input type={showKeys ? "text" : "password"} value={config.openaiKey} onChange={(e) => updateConfig('openaiKey', e.target.value)} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" placeholder="sk-..." />
                </div>
              </div>
            )}
          </>
        );
      case 'ollama':
        return (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Ollama URL</label>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                <input type="text" value={config.ollamaUrl} onChange={(e) => updateConfig('ollamaUrl', e.target.value)} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" placeholder="http://localhost:11434" />
              </div>
              <button onClick={handleOllamaSync} disabled={ollamaSyncing} className="px-4 bg-secondary border border-border rounded-xl hover:border-primary/50 transition-all text-muted-foreground hover:text-primary disabled:opacity-50 flex items-center gap-2">
                {ollamaSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                <span className="text-[10px] font-bold uppercase">Sync</span>
              </button>
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
              <input type={showKeys ? "text" : "password"} value={config.geminiKey} onChange={(e) => updateConfig('geminiKey', e.target.value)} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" />
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
              <input type={showKeys ? "text" : "password"} value={config.zaiKey} onChange={(e) => updateConfig('zaiKey', e.target.value)} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" />
            </div>
          </div>
        );
      case 'cloudflare':
        return (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Account ID</label>
              <input type="text" value={config.cloudflareAccountId} onChange={(e) => updateConfig('cloudflareAccountId', e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" />
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
                <input type={showKeys ? "text" : "password"} value={config.cloudflareToken} onChange={(e) => updateConfig('cloudflareToken', e.target.value)} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" />
              </div>
            </div>
          </>
        );
      case 'bedrock':
        return (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">AWS Region</label>
              <input type="text" value={config.awsRegion} onChange={(e) => updateConfig('awsRegion', e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" placeholder="us-east-1" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">AWS Profile</label>
              <input type="text" value={config.awsProfile} onChange={(e) => updateConfig('awsProfile', e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" placeholder="default" />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8 space-y-8 max-w-5xl mx-auto w-full pb-20">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">System Settings</h2>
              <p className="text-muted-foreground font-medium text-sm">Configure your AI providers, database, and system preferences.</p>
            </div>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className={cn(
                  "p-2.5 rounded-2xl border transition-all",
                  showDebug 
                    ? "bg-primary/10 border-primary/30 text-primary" 
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
                title="Inspect AI Requests"
              >
                <Bug size={20} />
              </button>
              {saveStatus === 'success' && (
                <div className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-500/20 animate-in fade-in slide-in-from-top-4">
                  <Check size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">Settings Saved</span>
                </div>
              )}
              <button 
                disabled={saving}
                onClick={handleSave}
                className="bg-primary text-primary-foreground px-10 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:opacity-90 transition-all shadow-xl shadow-primary/20 group disabled:opacity-50"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} className="group-hover:scale-110 transition-transform" />}
                Save Configuration
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Settings size={20} className="text-primary" />
                  <h3 className="font-bold tracking-tight text-lg text-foreground">System Preferences</h3>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-2xl border border-border/50 transition-all hover:border-primary/30 group">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground">AI Summarization</h4>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Generate searchable summaries for code blocks</p>
                  </div>
                  <button 
                    onClick={async () => {
                      if (!config) return;
                      const newSummarize = !config.summarize;
                      // Update local state and immediately save for this toggle
                      const newConfig = { ...config, summarize: newSummarize };
                      setConfig(newConfig);
                      setSaving(true);
                      try {
                        await axios.post('/api/config', newConfig);
                        setSaveStatus('success');
                        setTimeout(() => setSaveStatus('idle'), 3000);
                      } finally {
                        setSaving(false);
                      }
                    }} 
                    className={cn(
                      "px-6 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] border transition-all",
                      config?.summarize ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"
                    )}
                  >
                    {config?.summarize ? "Enabled" : "Disabled"}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-2xl border border-border/50 transition-all hover:border-primary/30 group">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-foreground">Offline Mode</h4>
                      <Shield size={14} className="text-primary" />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Disable remote model downloads (Local Provider only)</p>
                  </div>
                  <button 
                    onClick={async () => {
                      if (!config) return;
                      const newOffline = !config.offline;
                      const newConfig = { ...config, offline: newOffline };
                      setConfig(newConfig);
                      setSaving(true);
                      try {
                        await axios.post('/api/config', newConfig);
                        setSaveStatus('success');
                        setTimeout(() => setSaveStatus('idle'), 3000);
                      } finally {
                        setSaving(false);
                      }
                    }} 
                    className={cn(
                      "px-6 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] border transition-all",
                      config?.offline ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"
                    )}
                  >
                    {config?.offline ? "Offline" : "Online"}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-2xl border border-border/50 transition-all hover:border-primary/30 group">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-foreground">AI Reranker</h4>
                      <Zap size={14} className="text-primary" />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Use a second-pass model to re-sort results for extreme accuracy</p>
                  </div>
                  <button 
                    onClick={async () => {
                      if (!config) return;
                      const newUseReranker = !config.useReranker;
                      const newConfig = { ...config, useReranker: newUseReranker };
                      setConfig(newConfig);
                      setSaving(true);
                      try {
                        await axios.post('/api/config', newConfig);
                        setSaveStatus('success');
                        setTimeout(() => setSaveStatus('idle'), 3000);
                      } finally {
                        setSaving(false);
                      }
                    }} 
                    className={cn(
                      "px-6 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] border transition-all",
                      config?.useReranker ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"
                    )}
                  >
                    {config?.useReranker ? "Active" : "Disabled"}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-2xl border border-border/50 transition-all hover:border-primary/30 group">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-foreground">File Path Privacy</h4>
                      <Globe size={14} className="text-primary" />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Exclude directory paths from embeddings (reduces accuracy)</p>
                  </div>
                  <div className="flex bg-secondary rounded-lg p-1 border border-border">
                    <button 
                      onClick={() => {
                        const newConfig = { ...config, embedFilePath: 'full' };
                        setConfig(newConfig as Config);
                        setSaving(true);
                        axios.post('/api/config', newConfig).finally(() => setSaving(false));
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                        (config?.embedFilePath || 'full') === 'full' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Full Path
                    </button>
                    <button 
                      onClick={() => {
                        const newConfig = { ...config, embedFilePath: 'name' };
                        setConfig(newConfig as Config);
                        setSaving(true);
                        axios.post('/api/config', newConfig).finally(() => setSaving(false));
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                        config?.embedFilePath === 'name' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Name Only
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bot size={20} className="text-primary" />
                  <h3 className="font-bold tracking-tight text-lg text-foreground">Embedding Provider</h3>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleTestEmbedding} disabled={testingEmbedding} className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-50">
                    {testingEmbedding ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    Test
                  </button>
                  <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">{config?.provider}</div>
                </div>
              </div>
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Selected Provider</label>
                    <select value={config?.provider} onChange={(e) => updateConfig('provider', e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-bold transition-all appearance-none">
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
                      <input type="text" value={config?.embeddingModel} onChange={(e) => updateConfig('embeddingModel', e.target.value)} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-10 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" list="embedding-model-suggestions" />
                      <datalist id="embedding-model-suggestions">
                        {config && (config.provider === 'ollama' ? ollamaModels : EMBEDDING_MODELS[config.provider])?.map(m => <option key={m} value={m} />)}
                      </datalist>
                    </div>
                    {config && (config.provider === 'ollama' ? ollamaModels : EMBEDDING_MODELS[config.provider]) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(config.provider === 'ollama' ? ollamaModels : EMBEDDING_MODELS[config.provider]).map(m => (
                          <button key={m} onClick={() => updateConfig('embeddingModel', m)} className={cn("text-[10px] px-2 py-1 rounded-md border transition-all", config.embeddingModel === m ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary border-border text-muted-foreground hover:border-muted-foreground')}>
                            {m.split('/').pop()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-border/50">{config && renderProviderFields(config.provider)}</div>
              </div>
            </section>

            <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessagesSquare size={20} className="text-primary" />
                  <h3 className="font-bold tracking-tight text-lg text-foreground">LLM Provider</h3>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleTestLLM} disabled={testingLLM} className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-50">
                    {testingLLM ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    Test
                  </button>
                  <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">{config?.llmProvider || config?.provider}</div>
                </div>
              </div>
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Selected Provider</label>
                    <select value={config?.llmProvider || config?.provider} onChange={(e) => updateConfig('llmProvider', e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-bold transition-all appearance-none">
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
                      <input type="text" value={config?.llmModel || config?.embeddingModel} onChange={(e) => updateConfig('llmModel', e.target.value)} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-10 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" list="llm-model-suggestions" />
                      <datalist id="llm-model-suggestions">
                        {config && ((config.llmProvider || config.provider) === 'ollama' ? ollamaModels : CHAT_MODELS[config.llmProvider || config.provider])?.map(m => <option key={m} value={m} />)}
                      </datalist>
                    </div>
                    {config && ((config.llmProvider || config.provider) === 'ollama' ? ollamaModels : CHAT_MODELS[config.llmProvider || config.provider]) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {((config.llmProvider || config.provider) === 'ollama' ? ollamaModels : CHAT_MODELS[config.llmProvider || config.provider]).map(m => (
                          <button key={m} onClick={() => updateConfig('llmModel', m)} className={cn("text-[10px] px-2 py-1 rounded-md border transition-all", (config.llmModel || config.embeddingModel) === m ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary border-border text-muted-foreground hover:border-muted-foreground')}>
                            {m.split('/').pop()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-border/50">{config && renderProviderFields(config.llmProvider || config.provider)}</div>
              </div>
            </section>

            <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield size={20} className="text-primary" />
                  <h3 className="font-bold tracking-tight text-lg text-foreground">Vector Database</h3>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">DB Provider</label>
                    <select value={config?.dbProvider} onChange={(e) => updateConfig('dbProvider', e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-bold transition-all appearance-none">
                      <option value="local">Local (LanceDB)</option>
                      <option value="cloudflare">Cloudflare Vectorize</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Server Port</label>
                    <div className="relative">
                      <Server className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                      <input type="number" value={config?.port} onChange={(e) => updateConfig('port', parseInt(e.target.value))} className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono transition-all text-foreground" />
                    </div>
                  </div>
                </div>
                {config?.dbProvider === 'cloudflare' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-border/50">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Vectorize Index Name</label>
                      <input type="text" value={config.cloudflareVectorizeIndex} onChange={(e) => updateConfig('cloudflareVectorizeIndex', e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileCode size={20} className="text-primary" />
                  <h3 className="font-bold tracking-tight text-lg text-foreground">File Type Configuration</h3>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <p className="text-sm text-muted-foreground">Configure how different file types are indexed and summarized. This helps optimize performance and accuracy for various file types.</p>

                {config?.fileTypes && Object.entries(config.fileTypes).map(([typeId, typeConfig]) => (
                  <div key={typeId} className="bg-secondary/30 rounded-2xl p-6 border border-border/50 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-foreground capitalize flex items-center gap-2">
                          {typeId}
                          <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">{typeConfig.description}</span>
                        </h4>
                        <div className="flex flex-wrap gap-2 mt-2 items-center">
                          {typeConfig.extensions.map(ext => (
                            <span key={ext} className="group/tag relative text-[10px] font-mono px-2 py-1 bg-background border border-border rounded-md text-muted-foreground hover:border-red-400 hover:text-red-400 transition-colors cursor-default pr-5">
                              {ext}
                              <button
                                onClick={() => {
                                  const newFileTypes = { ...config.fileTypes };
                                  newFileTypes[typeId] = {
                                    ...typeConfig,
                                    extensions: typeConfig.extensions.filter(e => e !== ext)
                                  };
                                  updateConfig('fileTypes', newFileTypes);
                                }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/tag:opacity-100 p-0.5 hover:bg-red-400/10 rounded transition-all"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder=".ext"
                              className="w-16 bg-background border border-border rounded-md px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-primary transition-all"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const val = e.currentTarget.value.trim();
                                  if (val && !typeConfig.extensions.includes(val)) {
                                    const newFileTypes = { ...config.fileTypes };
                                    newFileTypes[typeId] = {
                                      ...typeConfig,
                                      extensions: [...typeConfig.extensions, val.startsWith('.') ? val : `.${val}`]
                                    };
                                    updateConfig('fileTypes', newFileTypes);
                                    e.currentTarget.value = '';
                                  }
                                }
                              }}
                            />
                            <button
                              onClick={(e) => {
                                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                const val = input.value.trim();
                                if (val && !typeConfig.extensions.includes(val)) {
                                  const newFileTypes = { ...config.fileTypes };
                                  newFileTypes[typeId] = {
                                    ...typeConfig,
                                    extensions: [...typeConfig.extensions, val.startsWith('.') ? val : `.${val}`]
                                  };
                                  updateConfig('fileTypes', newFileTypes);
                                  input.value = '';
                                }
                              }}
                              className="p-1 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-all"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={typeConfig.index !== false}
                            onChange={(e) => {
                              const newFileTypes = { ...config.fileTypes };
                              newFileTypes[typeId] = { ...typeConfig, index: e.target.checked };
                              updateConfig('fileTypes', newFileTypes);
                            }}
                            className="w-4 h-4 rounded border-border"
                          />
                          <span className="text-xs font-medium text-foreground">Index</span>
                        </label>
                        {typeConfig.index !== false && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={typeConfig.summarize}
                              onChange={(e) => {
                                const newFileTypes = { ...config.fileTypes };
                                newFileTypes[typeId] = { ...typeConfig, summarize: e.target.checked };
                                updateConfig('fileTypes', newFileTypes);
                              }}
                              className="w-4 h-4 rounded border-border"
                              disabled={typeConfig.index !== true && typeConfig.index !== undefined}
                            />
                            <span className="text-xs font-medium text-foreground">Summarize</span>
                          </label>
                        )}
                      </div>
                    </div>

                    {typeConfig.summarize && typeConfig.index !== false && (
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Prompt Template</label>
                          <select
                            value={typeConfig.promptTemplate || 'summarize'}
                            onChange={(e) => {
                              const newFileTypes = { ...config.fileTypes };
                              newFileTypes[typeId] = { ...typeConfig, promptTemplate: e.target.value };
                              updateConfig('fileTypes', newFileTypes);
                            }}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary transition-all"
                          >
                            <option value="summarize">Code Analysis</option>
                            <option value="docSummarize">Documentation Summary</option>
                            <option value="chunkSummarize">Chunk Analysis</option>
                          </select>
                        </div>

                        {typeConfig.maxLength !== undefined && (
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Max Content Length</label>
                            <input
                              type="number"
                              value={typeConfig.maxLength}
                              onChange={(e) => {
                                const newFileTypes = { ...config.fileTypes };
                                newFileTypes[typeId] = { ...typeConfig, maxLength: parseInt(e.target.value) || undefined };
                                updateConfig('fileTypes', newFileTypes);
                              }}
                              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary transition-all font-mono"
                              placeholder="No limit"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-primary">Tip:</strong> For large documentation files (.md, .txt), the content is automatically truncated before summarization to prevent timeouts. You can adjust the max length for each file type above.
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileCode size={20} className="text-primary" />
                  <h3 className="font-bold tracking-tight text-lg text-foreground">Git Integration</h3>
                </div>
              </div>
              <div className="p-8 space-y-6">
                {/* Enable/Disable Git Integration */}
                <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-2xl border border-border/50 transition-all hover:border-primary/30 group">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground">Git Metadata Collection</h4>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                      Collect commit author, date, and churn information during indexing
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!config) return;
                      const newEnabled = !config.gitIntegration?.enabled;
                      const newConfig = {
                        ...config,
                        gitIntegration: {
                          enabled: newEnabled,
                          embedInVector: config.gitIntegration?.embedInVector ?? true,
                          storeAsMetadata: true,
                          churnWindow: config.gitIntegration?.churnWindow ?? 6
                        }
                      };
                      setConfig(newConfig);
                      setSaving(true);
                      try {
                        await axios.post('/api/config', newConfig);
                        setSaveStatus('success');
                        setTimeout(() => setSaveStatus('idle'), 3000);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className={cn(
                      "px-6 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] border transition-all",
                      config?.gitIntegration?.enabled
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-secondary border-border text-muted-foreground"
                    )}
                  >
                    {config?.gitIntegration?.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>

                {/* Embed in Vector (only shown if git integration enabled) */}
                {config?.gitIntegration?.enabled && (
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-2xl border border-border/50 transition-all hover:border-primary/30 group">
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-foreground">Include in Embeddings</h4>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                        Add git info to embedding text (enables semantic search like "recent changes by Alice")
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        if (!config) return;
                        const newEmbedInVector = !config.gitIntegration?.embedInVector;
                        const newConfig = {
                          ...config,
                          gitIntegration: {
                            enabled: true,
                            embedInVector: newEmbedInVector,
                            storeAsMetadata: true,
                            churnWindow: config.gitIntegration?.churnWindow ?? 6
                          }
                        };
                        setConfig(newConfig);
                        setSaving(true);
                        try {
                          await axios.post('/api/config', newConfig);
                          setSaveStatus('success');
                          setTimeout(() => setSaveStatus('idle'), 3000);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className={cn(
                        "px-6 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] border transition-all",
                        config?.gitIntegration?.embedInVector
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-secondary border-border text-muted-foreground"
                      )}
                    >
                      {config?.gitIntegration?.embedInVector ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                )}

                {/* Churn Window Setting */}
                {config?.gitIntegration?.enabled && (
                  <div className="p-4 bg-secondary/30 rounded-2xl border border-border/50 transition-all hover:border-primary/30 group">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <h4 className="font-bold text-sm text-foreground">Churn Calculation Window</h4>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                          Number of months to analyze for commit frequency (default: 6 months)
                        </p>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={config?.gitIntegration?.churnWindow ?? 6}
                        onChange={(e) => {
                          if (!config) return;
                          const value = parseInt(e.target.value) || 6;
                          setConfig({
                            ...config,
                            gitIntegration: {
                              enabled: true,
                              embedInVector: config.gitIntegration?.embedInVector ?? true,
                              storeAsMetadata: true,
                              churnWindow: value
                            }
                          });
                        }}
                        className="w-32 px-4 py-2 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                )}

                {/* Info message about re-indexing */}
                {config?.gitIntegration?.enabled && (
                  <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
                    <p className="text-xs text-blue-400 font-medium">
                      💡 Note: Git metadata is collected during indexing. Re-index projects to apply these settings to existing code.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap size={20} className="text-primary" />
                  <h3 className="font-bold tracking-tight text-lg text-foreground">Throttling & Resilience</h3>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Throttling Error Patterns</label>
                    <p className="text-[10px] text-muted-foreground px-1 mb-3">If any of these strings appear in an API error, VibeScout will automatically reduce concurrency and retry.</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {config?.throttlingErrors.map(pattern => (
                        <span key={pattern} className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs font-mono text-foreground group">
                          {pattern}
                          <button onClick={() => removeErrorPattern(pattern)} className="text-muted-foreground hover:text-red-400 transition-colors"><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Add error message or code (e.g. 1302)" value={newErrorPattern} onChange={(e) => setNewErrorPattern(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addErrorPattern()} className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary transition-all" />
                      <button onClick={addErrorPattern} className="bg-secondary border border-border hover:border-primary/50 p-2 rounded-xl text-muted-foreground hover:text-primary transition-all"><Plus size={20} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {showDebug && <DebugPanel />}
    </div>
  );
}