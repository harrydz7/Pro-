



import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import ProtectedRoute from './components/ProtectedRoute.tsx';
import MainAppPage from './MainAppPage.tsx';
import CollageMakerPage from './CollageMakerPage.tsx';
import UploaderPage from './UploaderPage.tsx';
import ManagePostsPage from './ManagePostsPage.tsx';
import PageInsightsPage from './EarningsAnalyticsPage.tsx';
import CrossPostPage from './CrossPostPage.tsx'; // Import the new page
import ScraperPage from './ScraperPage.tsx'; // Import the new page
import { SidebarProvider } from './src/contexts/SidebarContext.tsx';
import { NotificationProvider } from './src/contexts/NotificationContext.tsx';

const App: React.FC = () => {
  return (
    <NotificationProvider> {/* Added NotificationProvider */}
      <SidebarProvider>
        <HashRouter>
          <Routes>
            <Route 
              path="/*" 
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route index element={<Navigate to="/dashboard" replace />} />
                      <Route path="dashboard" element={<MainAppPage />} />
                      <Route path="collage-maker" element={<CollageMakerPage />} />
                      <Route path="cross-post" element={<CrossPostPage />} />
                      <Route path="uploader" element={<UploaderPage />} />
                      <Route path="manage-posts" element={<ManagePostsPage />} /> {/* Add new route for Manage Posts */}
                      <Route path="page-insights" element={<PageInsightsPage />} />
                      <Route path="scraper" element={<ScraperPage />} />
                      <Route path="*" element={<Navigate to="/dashboard" replace />} /> {/* Fallback for any other path */}
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </HashRouter>
      </SidebarProvider>
    </NotificationProvider>
  );
};

export default App;