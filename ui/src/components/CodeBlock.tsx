import { useEffect, useRef, useState } from 'react';
import Prism from 'prismjs';
import { Check, Copy, ExternalLink } from 'lucide-react';
import axios from 'axios';

// Import common languages
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';

interface CodeBlockProps {
  code: string;
  language?: string;
  filePath?: string;
  showOpenInEditor?: boolean;
}

export default function CodeBlock({ code, language, filePath, showOpenInEditor }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopying] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const handleOpenInEditor = async () => {
    if (!filePath) return;
    try {
      await axios.post('/api/open', { filePath });
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  // Map file extension to prism language if needed
  const getLanguage = () => {
    if (language) return language;
    if (!filePath) return 'javascript';
    const ext = filePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'go': 'go',
      'java': 'java',
      'kt': 'java',
      'json': 'json',
      'md': 'markdown',
      'sh': 'bash',
      'yaml': 'yaml',
      'yml': 'yaml'
    };
    return map[ext || ''] || 'javascript';
  };

  const lang = getLanguage();

  return (
    <div className="relative group rounded-xl overflow-hidden border border-border/50 bg-[#282c34]">
      <div className="flex items-center justify-between px-4 py-2 bg-black/20 border-b border-border/30">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
          {lang} {filePath && `• ${filePath.split('/').pop()}`}
        </span>
        <div className="flex items-center gap-2">
          {showOpenInEditor && filePath && (
            <button 
              onClick={handleOpenInEditor}
              className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-muted-foreground hover:text-primary"
              title="Open in Editor"
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button 
            onClick={handleCopy}
            className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-muted-foreground hover:text-foreground"
            title="Copy Code"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <pre className={`!m-0 !bg-transparent text-sm scrollbar-thin scrollbar-thumb-white/10`}>
        <code ref={codeRef} className={`language-${lang}`}>
          {code}
        </code>
      </pre>
    </div>
  );
}
