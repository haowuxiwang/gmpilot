/**
 * Tests for useToast hook and ToastProvider.
 * Covers: useToast re-export, ToastProvider, useToastActions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode } from 'react';

// Import from the re-export file to cover useToast.ts
import { useToast, type ToastType, type Toast } from '../useToast';
// Import useToastActions from provider directly
import { ToastProvider, useToastActions } from '@/providers/ToastProvider';

// Mock ToastContainer to avoid rendering actual UI
vi.mock('@/components/ui/Toast', () => ({
  ToastContainer: ({ toasts, onRemove: _onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) =>
    React.createElement('div', { 'data-testid': 'toast-container', 'data-count': toasts.length }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return React.createElement(ToastProvider, null, children);
}

describe('useToast (re-export)', () => {
  it('should export useToast function', () => {
    expect(typeof useToast).toBe('function');
  });

  it('should export ToastType and Toast types (compile-time check)', () => {
    // Type-level assertion: these exist at compile time
    const typeCheck: ToastType = 'success';
    expect(typeCheck).toBe('success');
  });
});

describe('ToastProvider + useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should throw when used outside ToastProvider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useToast());
    }).toThrow('useToast must be used within ToastProvider');
    spy.mockRestore();
  });

  it('should return empty toasts initially', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(result.current.toasts).toEqual([]);
  });

  it('should add a success toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success('操作成功');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('success');
    expect(result.current.toasts[0].message).toBe('操作成功');
  });

  it('should add an error toast with longer duration', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.error('出错了');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('error');
    expect(result.current.toasts[0].duration).toBe(5000);
  });

  it('should add a warning toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.warning('注意');
    });

    expect(result.current.toasts[0].type).toBe('warning');
  });

  it('should add an info toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.info('提示');
    });

    expect(result.current.toasts[0].type).toBe('info');
  });

  it('should auto-remove toast after duration', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success('临时消息');
    });

    expect(result.current.toasts).toHaveLength(1);

    // Advance past default 3000ms duration
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should manually remove toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let toastId: string;
    act(() => {
      toastId = result.current.success('可移除');
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.removeToast(toastId!);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should add multiple toasts', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success('消息1');
      result.current.error('消息2');
      result.current.warning('消息3');
    });

    expect(result.current.toasts).toHaveLength(3);
  });

  it('should use addToast with custom duration', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.addToast('info', '自定义时长', 1000);
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should not auto-remove toast with duration 0', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.addToast('info', '永久消息', 0);
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Should still be there
    expect(result.current.toasts).toHaveLength(1);
  });

  it('should generate unique IDs for each toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let id1: string, id2: string;
    act(() => {
      id1 = result.current.success('A');
      id2 = result.current.success('B');
    });

    expect(id1!).not.toBe(id2!);
  });
});

describe('useToastActions', () => {
  it('should throw when used outside ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useToastActions());
    }).toThrow('useToastActions must be used within ToastProvider');
    spy.mockRestore();
  });

  it('should return stable action references', () => {
    const { result, rerender } = renderHook(() => useToastActions(), { wrapper });

    const firstSuccess = result.current.success;
    const firstError = result.current.error;
    rerender();
    // Individual callbacks are stable (useCallback)
    expect(result.current.success).toBe(firstSuccess);
    expect(result.current.error).toBe(firstError);
  });

  it('should provide all action methods', () => {
    const { result } = renderHook(() => useToastActions(), { wrapper });

    expect(typeof result.current.addToast).toBe('function');
    expect(typeof result.current.removeToast).toBe('function');
    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.error).toBe('function');
    expect(typeof result.current.warning).toBe('function');
    expect(typeof result.current.info).toBe('function');
  });
});
