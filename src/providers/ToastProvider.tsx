/**
 * Toast notification provider.
 * Split into two contexts (actions vs state) to prevent unnecessary re-renders.
 * Components using only actions (success/error/warning) won't re-render on toast state changes.
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { ToastContainer } from '@/components/ui/Toast';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastActions {
  addToast: (type: ToastType, message: string, duration?: number) => string;
  removeToast: (id: string) => void;
  success: (message: string) => string;
  error: (message: string) => string;
  warning: (message: string) => string;
  info: (message: string) => string;
}

interface ToastState {
  toasts: Toast[];
}

const ToastActionsContext = createContext<ToastActions | null>(null);
const ToastStateContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup all pending timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current.clear();
    };
  }, []);

  const addToast = useCallback((type: ToastType, message: string, duration = 3000) => {
    const id = `toast-${++counterRef.current}`;
    const toast: Toast = { id, type, message, duration };
    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      const timeoutId = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timeoutsRef.current.delete(id);
      }, duration);
      timeoutsRef.current.set(id, timeoutId);
    }

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    const timeoutId = timeoutsRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((message: string) => addToast('success', message), [addToast]);
  const error = useCallback((message: string) => addToast('error', message, 5000), [addToast]);
  const warning = useCallback((message: string) => addToast('warning', message), [addToast]);
  const info = useCallback((message: string) => addToast('info', message), [addToast]);

  return (
    <ToastActionsContext.Provider value={{ addToast, removeToast, success, error, warning, info }}>
      <ToastStateContext.Provider value={{ toasts }}>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        {children}
      </ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  );
}

/**
 * useToast - Returns toast actions + state.
 * For components that only trigger toasts (buttons, forms), use useToastActions() instead.
 */
export function useToast(): ToastActions & ToastState {
  const actions = useContext(ToastActionsContext);
  const state = useContext(ToastStateContext);
  if (!actions || !state) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return { ...actions, ...state };
}

/**
 * useToastActions - Returns only toast actions (stable reference).
 * Won't cause re-render when toast list changes.
 */
export function useToastActions(): ToastActions {
  const actions = useContext(ToastActionsContext);
  if (!actions) {
    throw new Error('useToastActions must be used within ToastProvider');
  }
  return actions;
}
