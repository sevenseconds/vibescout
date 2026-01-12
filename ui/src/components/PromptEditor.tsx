import { MessageSquare } from 'lucide-react';

interface PromptEditorProps {
  title: string;
  description: string;
  value: string;
  onChange: (val: string) => void;
  height?: string;
  placeholder?: string;
}

export default function PromptEditor({ title, description, value, onChange, height = "h-40", placeholder = "Enter your prompt template here..." }: PromptEditorProps) {
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
          className={`w-full ${height} bg-secondary/30 border border-border rounded-2xl p-4 font-mono text-xs focus:outline-none focus:border-primary transition-all resize-none leading-relaxed`}
          placeholder={placeholder}
        />
      </div>
    </section>
  );
}
