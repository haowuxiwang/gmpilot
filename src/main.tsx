import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import gsap from 'gsap';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { initGlobalErrorCapture } from '@/lib/logger';
import App from './App';
import './index.css';

// Initialize global error capture
initGlobalErrorCapture();

// Accessibility: skip GSAP animations when user prefers reduced motion
if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.globalTimeline.timeScale(100);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>,
);
