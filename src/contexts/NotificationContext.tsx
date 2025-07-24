import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

export interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface NotificationContextType {
  addNotification: (message: string, type: Notification['type']) => void;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((message: string, type: Notification['type']) => {
    const newNotification: Notification = {
      id: Date.now(),
      message,
      type,
    };
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const value = {
    addNotification,
    notifications,
    setNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
