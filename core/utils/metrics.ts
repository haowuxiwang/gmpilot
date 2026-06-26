/**
 * Performance metrics utility.
 * Tracks timing for key operations.
 */

import { createLogger } from './logger';

const log = createLogger('Metrics');

// ============================================================================
// Types
// ============================================================================

export interface MetricEntry {
  name: string;
  duration: number;
  timestamp: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Metrics Store
// ============================================================================

class MetricsStore {
  private metrics: MetricEntry[] = [];
  private maxSize = 1000;

  add(entry: MetricEntry): void {
    this.metrics.push(entry);
    if (this.metrics.length > this.maxSize) {
      this.metrics.shift();
    }
  }

  getRecent(count: number = 100): MetricEntry[] {
    return this.metrics.slice(-count);
  }

  getByName(name: string): MetricEntry[] {
    return this.metrics.filter(m => m.name === name);
  }

  getStats(name: string): { count: number; avgDuration: number; successRate: number } {
    const entries = this.getByName(name);
    if (entries.length === 0) {
      return { count: 0, avgDuration: 0, successRate: 0 };
    }

    const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
    const successCount = entries.filter(e => e.success).length;

    return {
      count: entries.length,
      avgDuration: totalDuration / entries.length,
      successRate: successCount / entries.length,
    };
  }

  clear(): void {
    this.metrics = [];
  }
}

const store = new MetricsStore();

// ============================================================================
// Public API
// ============================================================================

/**
 * Record a metric entry.
 */
export function recordMetric(name: string, duration: number, success: boolean, metadata?: Record<string, unknown>): void {
  const entry: MetricEntry = {
    name,
    duration,
    timestamp: Date.now(),
    success,
    metadata,
  };

  store.add(entry);
  log.debug('Metric recorded', { name, duration: `${duration}ms`, success });
}

/**
 * Time an async operation and record the metric.
 */
export async function timeOperation<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    recordMetric(name, duration, true, metadata);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    recordMetric(name, duration, false, { ...metadata, error: String(error) });
    throw error;
  }
}

/**
 * Get metrics statistics.
 */
export function getMetricsStats(name: string) {
  return store.getStats(name);
}

/**
 * Get recent metrics.
 */
export function getRecentMetrics(count?: number) {
  return store.getRecent(count);
}

/**
 * Clear all metrics.
 */
export function clearMetrics() {
  store.clear();
}
