import React, {createContext, useContext, useState, useCallback, type ReactNode} from 'react';

export type NotificationLevel = 'info' | 'warning' | 'error';

export interface Notification {
  id: number;
  level: NotificationLevel;
  message: string;
  createdAt: number;
}

type NotificationContextValue = {
  notifications: Notification[];
  addNotification: (level: NotificationLevel, message: string) => void;
  removeNotification: (id: number) => void;
};

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  addNotification: () => {},
  removeNotification: () => {},
});

let nextId = 0;
const AUTO_DISMISS_MS = 4000;

export function NotificationProvider({children}: {children: ReactNode}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((level: NotificationLevel, message: string) => {
    const id = nextId++;
    const n: Notification = {id, level, message, createdAt: Date.now()};
    setNotifications((prev) => [...prev, n]);
    setTimeout(() => removeNotification(id), AUTO_DISMISS_MS);
  }, [removeNotification]);

  return (
    <NotificationContext.Provider value={{notifications, addNotification, removeNotification}}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
