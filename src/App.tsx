/**
 * 应用根组件
 */

import { Routes, Route } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastProvider } from '@/providers/ToastProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AgentPage } from '@/pages/AgentPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { KnowledgePage } from '@/pages/KnowledgePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-surface">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<AgentPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/knowledge" element={<KnowledgePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </ToastProvider>
  );
}
