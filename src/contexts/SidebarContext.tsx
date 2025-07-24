

import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

interface SidebarContextType {
  sidebarControls: ReactNode | null;
  setSidebarControls: (controls: ReactNode | null) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = (): SidebarContextType => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

interface SidebarProviderProps {
  children: ReactNode;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({ children }) => {
  const [sidebarControls, setSidebarControlsState] = useState<ReactNode | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const setSidebarControls = useCallback((controls: ReactNode | null) => {
    setSidebarControlsState(controls);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  return (
    <SidebarContext.Provider value={{ sidebarControls, setSidebarControls, isSidebarOpen, toggleSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
};
