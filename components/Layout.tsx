





import React, { createContext, useState, useEffect, useContext, ReactNode, useRef, useLayoutEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { SunIcon, MoonIcon, DocumentTextIcon, ChevronDoubleLeftIcon, CollageIcon, UploadIcon, ClipboardListIcon, ChartBarIcon, CrossPostIcon, ScraperIcon } from './IconComponents.tsx';
import { useSidebar } from '../src/contexts/SidebarContext.tsx';
import NotificationSystem from './NotificationSystem.tsx';

interface ThemeContextType {
  theme: string;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [theme, setTheme] = useState<string>(() => {
    const savedTheme = localStorage.getItem('globalTheme');
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const { sidebarControls, isSidebarOpen, toggleSidebar } = useSidebar();
  
  // Refs to manage sidebar scroll position
  const sidebarScrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollPositionRef = useRef<number>(0);

  // Handler to save the scroll position to a ref whenever the user scrolls
  const handleScroll = useCallback(() => {
    if (sidebarScrollContainerRef.current) {
      lastScrollPositionRef.current = sidebarScrollContainerRef.current.scrollTop;
    }
  }, []);

  // Effect to restore the scroll position after the sidebar content has been re-rendered
  useLayoutEffect(() => {
    if (sidebarScrollContainerRef.current) {
      sidebarScrollContainerRef.current.scrollTop = lastScrollPositionRef.current;
    }
  }, [sidebarControls]); // This dependency is crucial: the effect runs when the sidebar content is replaced

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('globalTheme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  const navLinkClasses = ({ isActive }: { isActive: boolean }): string =>
    `flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 ease-in-out gap-3 ${isSidebarOpen ? '' : 'justify-center'} ${
      isActive 
        ? 'bg-primary text-primary-text shadow-lg' 
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
    }`;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <NotificationSystem /> {/* Add notification system here */}
      <div className="flex h-screen"> 
        <aside className={`relative flex-shrink-0 bg-white dark:bg-gray-800 shadow-xl p-4 flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-72' : 'w-20'}`}>
          <button 
            onClick={toggleSidebar}
            className="absolute z-10 top-1/2 -right-3 transform -translate-y-1/2 w-6 h-6 bg-gray-600 dark:bg-gray-700 text-white rounded-full flex items-center justify-center shadow-md hover:bg-[var(--app-primary-color)] transition-all duration-200"
            aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronDoubleLeftIcon className={`w-4 h-4 transition-transform duration-300 ${!isSidebarOpen && 'rotate-180'}`} />
          </button>
          
          <div className={`flex items-center ${isSidebarOpen ? 'justify-center' : 'justify-center'}`}>
            {isSidebarOpen && (
                <h1 className="text-2xl font-bold text-[var(--app-primary-color)] dark:text-[var(--app-primary-color)] text-center py-2 font-alegreya-serif">
                    Content App
                </h1>
            )}
          </div>

          <nav className="flex-grow-0 mb-4 mt-2">
            <ul className="space-y-2">
              <li>
                <NavLink to="/dashboard" className={navLinkClasses}>
                  <DocumentTextIcon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && <span className="truncate">Main App</span>}
                </NavLink>
              </li>
              <li>
                <NavLink to="/collage-maker" className={navLinkClasses}>
                  <CollageIcon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && <span className="truncate">Collage Maker</span>}
                </NavLink>
              </li>
               <li>
                <NavLink to="/cross-post" className={navLinkClasses}>
                  <CrossPostIcon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && <span className="truncate">Cross Post</span>}
                </NavLink>
              </li>
              <li>
                <NavLink to="/uploader" className={navLinkClasses}>
                  <UploadIcon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && <span className="truncate">Scheduler</span>}
                </NavLink>
              </li>
              <li>
                <NavLink to="/manage-posts" className={navLinkClasses}>
                  <ClipboardListIcon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && <span className="truncate">Manage Posts</span>}
                </NavLink>
              </li>
              <li>
                <NavLink to="/page-insights" className={navLinkClasses}>
                  <ChartBarIcon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && <span className="truncate">Page Insights</span>}
                </NavLink>
              </li>
              <li>
                <NavLink to="/scraper" className={navLinkClasses}>
                  <ScraperIcon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && <span className="truncate">Scraper</span>}
                </NavLink>
              </li>
            </ul>
          </nav>

          {isSidebarOpen && (
            <div 
              ref={sidebarScrollContainerRef}
              onScroll={handleScroll}
              className="flex-grow overflow-y-auto settings-sidebar-content border-t border-gray-200 dark:border-gray-700 pt-4 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800">
              {sidebarControls}
            </div>
          )}
        </aside>
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <div className="p-2 md:p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </ThemeContext.Provider>
  );
};

export default Layout;