import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { subscribeToNotifications } from '../utils/events';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface IndexProgress {
  active: boolean;
  projectName: string;
  totalFiles: number;
  processedFiles: number;
  status: string;
}

export default function NotificationTray() {
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    // Subscribe to manual notifications
    const unsubscribe = subscribeToNotifications((n) => {
      setNotification(n);
      if (n.type === 'success') {
        setTimeout(() => setNotification(null), 5000);
      }
    });

    // Use SSE for system-wide indexing status
    const eventSource = new EventSource('/api/events');
    let lastActive = false;

    eventSource.addEventListener('indexStatus', (event) => {
      try {
        const progress: IndexProgress = JSON.parse(event.data);
        
        // Detect transition from active -> completed
        if (lastActive && !progress.active && progress.status === 'completed') {
          setNotification({
            type: 'success',
            message: `Indexing complete: ${progress.projectName}`
          });
          setTimeout(() => setNotification(null), 5000);
        }

        // Detect errors
        if (progress.status.startsWith('error')) {
          setNotification({
            type: 'error',
            message: `Indexing failed: ${progress.projectName}`
          });
        }

        lastActive = progress.active;
      } catch (err) {
        console.error('Failed to parse index status event:', err);
      }
    });

    return () => {
      eventSource.close();
      unsubscribe();
    };
  }, []);

  if (!notification) return null;

  return (
    <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-right-8 duration-300">
      <div className={cn(
        "flex items-center gap-4 p-4 rounded-2xl shadow-2xl border min-w-[320px]",
        notification.type === 'success' ? "bg-card border-emerald-500/20" : "bg-card border-red-500/20"
      )}>
        <div className={cn(
          "p-2 rounded-xl shrink-0",
          notification.type === 'success' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
        )}>
          {notification.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-sm">System Update</h4>
          <p className="text-xs text-muted-foreground font-medium">{notification.message}</p>
        </div>
        <button 
          onClick={() => setNotification(null)}
          className="p-1 hover:bg-secondary rounded-lg text-muted-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
