import { useState, useEffect } from 'react';
import { Folder, ChevronRight, Home, X, ChevronLeft, Search, Loader2 } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FolderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export default function FolderPicker({ isOpen, onClose, onSelect }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [directories, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchDirs = async (path: string) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/fs/ls?path=${encodeURIComponent(path)}`);
      setDirs(res.data);
      setCurrentPath(path);
    } catch (err) {
      console.error('Failed to read directory:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHome = async () => {
    try {
      const res = await axios.get('/api/fs/home');
      fetchDirs(res.data.path);
    } catch (err) {
      console.error('Failed to get home dir:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHome();
    }
  }, [isOpen]);

  const handleNavigate = (name: string) => {
    const separator = currentPath.includes('\\') ? '\\' : '/';
    const newPath = currentPath.endsWith(separator) 
      ? currentPath + name 
      : currentPath + separator + name;
    fetchDirs(newPath);
  };

  const handleBack = () => {
    const separator = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(separator).filter(Boolean);
    if (parts.length === 0) return;
    
    parts.pop();
    let newPath = parts.join(separator);
    if (currentPath.startsWith(separator)) newPath = separator + newPath;
    if (currentPath.startsWith('C:')) newPath = newPath; // Handle Windows drive
    
    fetchDirs(newPath || separator);
  };

  if (!isOpen) return null;

  const filteredDirs = directories.filter(d => d.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-2xl h-[600px] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              <Folder size={20} />
            </div>
            <div>
              <h3 className="font-bold text-lg">Select Project Folder</h3>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Local Explorer</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Path & Controls */}
        <div className="p-4 border-b border-border space-y-4 bg-card">
          <div className="flex items-center gap-2">
            <button 
              onClick={handleBack}
              className="p-2 hover:bg-secondary rounded-lg text-muted-foreground transition-colors"
              title="Go Back"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={fetchHome}
              className="p-2 hover:bg-secondary rounded-lg text-muted-foreground transition-colors"
              title="Home"
            >
              <Home size={18} />
            </button>
            <div className="flex-1 bg-secondary/50 px-3 py-2 rounded-lg border border-border/50 text-xs font-mono text-muted-foreground truncate">
              {currentPath}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
            <input 
              type="text"
              placeholder="Search folders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {filteredDirs.map(name => (
                <button 
                  key={name}
                  onClick={() => handleNavigate(name)}
                  className="flex items-center justify-between p-3 hover:bg-primary/5 rounded-xl transition-all group border border-transparent hover:border-primary/20"
                >
                  <div className="flex items-center gap-3">
                    <Folder size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium">{name}</span>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              ))}
              {filteredDirs.length === 0 && (
                <div className="p-12 text-center text-muted-foreground italic text-sm">
                  No sub-folders found.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/30 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-secondary transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSelect(currentPath)}
            className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            Select Current Folder
          </button>
        </div>
      </div>
    </div>
  );
}
