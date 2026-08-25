/**
 * Tests for useDebounce hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('should debounce value updates', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } },
    );

    // Update value
    rerender({ value: 'updated' });

    // Value should not change immediately
    expect(result.current).toBe('initial');

    // Advance time by less than delay
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('initial');

    // Advance time past delay
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('updated');
  });

  it('should reset timer on rapid updates', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    );

    // Rapid updates
    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'abcd' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Still showing initial because timer keeps resetting
    expect(result.current).toBe('a');

    // Wait for full delay after last update
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('abcd');
  });

  it('should use custom delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } },
    );

    rerender({ value: 'updated', delay: 500 });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('updated');
  });

  it('should work with number values', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 0 } },
    );

    rerender({ value: 42 });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(42);
  });

  it('should work with object values', () => {
    const initialObj = { name: 'test' };
    const updatedObj = { name: 'updated' };

    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: initialObj } },
    );

    rerender({ value: updatedObj });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toEqual(updatedObj);
  });

  it('should cleanup timer on unmount', () => {
    const { unmount } = renderHook(() => useDebounce('test', 300));

    // Should not throw on unmount
    expect(() => unmount()).not.toThrow();
  });

  it('should handle zero delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 0),
      { initialProps: { value: 'initial' } },
    );

    rerender({ value: 'updated' });

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe('updated');
  });
});
