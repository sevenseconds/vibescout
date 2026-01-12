type Notification = { type: 'success' | 'error', message: string };
type Listener = (n: Notification) => void;

const listeners: Listener[] = [];

export const notify = (type: 'success' | 'error', message: string) => {
  const n = { type, message };
  listeners.forEach(l => l(n));
};

export const subscribeToNotifications = (listener: Listener) => {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx > -1) listeners.splice(idx, 1);
  };
};
