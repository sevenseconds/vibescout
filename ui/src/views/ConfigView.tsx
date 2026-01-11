import { useState, useEffect } from 'react';
import { Bot, Save, Shield, Loader2, Cpu, Key, Globe, Server, Check, AlertCircle, Eye, EyeOff, Settings, MessagesSquare, Zap, Plus, X, RefreshCw } from 'lucide-react';
import axios from 'axios';
import modelsData from '../models.json';

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
  throttlingErrors: string[];
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

  const fetchOllamaModels = async () => {
    if (!config?.ollamaUrl) return;
    try {
      const res = await axios.get(`/api/models/ollama?url=${encodeURIComponent(config.ollamaUrl)}`);
      setOllamaModels(res.data.map((m: any) => m.name));
    } catch (err) {
      console.error('Ollama models fetch failed:', err);
    }
  };

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

  useEffect(() => {
    if (config?.ollamaUrl) {
      fetchOllamaModels();
    }
  }, [config?.ollamaUrl]);

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
      const models = res.data;
      const modelNames = models.map((m: any) => m.name);
      setOllamaModels(modelNames);
      
      alert(`Ollama Sync Success!\n\nAvailable models: ${modelNames.join(', ')}`);
      
      // Heuristic: check if current model is in the list
      const current = config?.embeddingModel;
      if (current && !modelNames.includes(current)) {
        const found = modelNames.find((m: string) => m.startsWith(current) || current.startsWith(m));
        if (found) {
          alert(`Name Mismatch Detected!\n\nYou selected "${current}" but Ollama has it as "${found}". Updating to the correct name...`);
          updateConfig('embeddingModel', found);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to Ollama. Make sure it is running and the URL is correct.');
    } finally {
      setOllamaSyncing(false);
    }
  };

  const handleTestEmbedding = async () => {
    setTestingEmbedding(true);
    try {
      const res = await axios.post('/api/test/embedding');
      alert(`Embedding Test: ${res.data.message}`);
    } catch (err: any) {
      alert(`Embedding Test Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setTestingEmbedding(false);
    }
  };

  const handleTestLLM = async () => {
    setTestingLLM(true);
    try {
      const res = await axios.post('/api/test/llm');
      alert(`LLM Test: ${res.data.message}`);
    } catch (err: any) {
      alert(`LLM Test Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setTestingLLM(false);
    }
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
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                <input 
                  type="text" 
                  value={config.ollamaUrl}
                  onChange={(e) => updateConfig('ollamaUrl', e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
                  placeholder="http://localhost:11434"
                />
              </div>
              <button 
                onClick={handleOllamaSync}
                disabled={ollamaSyncing}
                className="px-4 bg-secondary border border-border rounded-xl hover:border-primary/50 transition-all text-muted-foreground hover:text-primary disabled:opacity-50 flex items-center gap-2"
                title="Sync & Verify Models"
              >
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
            <div className="flex items-center gap-3">
              <button 
                onClick={handleTestEmbedding}
                disabled={testingEmbedding}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-50"
              >
                {testingEmbedding ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Test
              </button>
              <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
                {config?.provider}
              </div>
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
                    {config && (config.provider === 'ollama' ? ollamaModels : EMBEDDING_MODELS[config.provider])?.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <div className="absolute right-4 top-3.5">
                     <Settings size={16} className="text-muted-foreground/50" />
                  </div>
                </div>
                {config && (config.provider === 'ollama' ? ollamaModels : EMBEDDING_MODELS[config.provider]) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(config.provider === 'ollama' ? ollamaModels : EMBEDDING_MODELS[config.provider]).map(m => (
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
            <div className="flex items-center gap-3">
              <button 
                onClick={handleTestLLM}
                disabled={testingLLM}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-50"
              >
                {testingLLM ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Test
              </button>
              <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
                {config?.llmProvider || config?.provider}
              </div>
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
                    {config && ((config.llmProvider || config.provider) === 'ollama' ? ollamaModels : CHAT_MODELS[config.llmProvider || config.provider])?.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <div className="absolute right-4 top-3.5">
                     <Settings size={16} className="text-muted-foreground/50" />
                  </div>
                </div>
                {config && ((config.llmProvider || config.provider) === 'ollama' ? ollamaModels : CHAT_MODELS[config.llmProvider || config.provider]) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {((config.llmProvider || config.provider) === 'ollama' ? ollamaModels : CHAT_MODELS[config.llmProvider || config.provider]).map(m => (
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

        {/* Throttling & Resilience Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 bg-secondary/50 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap size={20} className="text-primary" />
              <h3 className="font-bold tracking-tight text-lg text-foreground">Throttling & Resilience</h3>
            </div>
            <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              Adaptive Control
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
                      <button 
                        onClick={() => removeErrorPattern(pattern)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Add error message or code (e.g. 1302)"
                    value={newErrorPattern}
                    onChange={(e) => setNewErrorPattern(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addErrorPattern()}
                    className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary transition-all"
                  />
                  <button 
                    onClick={addErrorPattern}
                    className="bg-secondary border border-border hover:border-primary/50 p-2 rounded-xl text-muted-foreground hover:text-primary transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </div>
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