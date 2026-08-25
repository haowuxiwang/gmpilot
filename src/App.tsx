/**
 * 应用根组件
 */

import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastProvider } from '@/providers/ToastProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AgentPage } from '@/pages/AgentPage';

// Route-level code splitting (AgentPage stays synchronous as primary route)
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const KnowledgePage = lazy(() => import('@/pages/KnowledgePage').then(m => ({ default: m.KnowledgePage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

export default function App() {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-surface">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center h-full text-stone-400 text-sm">加载中...</div>}>
              <Routes>
                <Route path="/" element={<AgentPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </ToastProvider>
  );
}
