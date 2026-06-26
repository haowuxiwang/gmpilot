import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordMetric,
  timeOperation,
  getMetricsStats,
  getRecentMetrics,
  clearMetrics,
} from '../metrics';

describe('metrics', () => {
  beforeEach(() => {
    clearMetrics();
  });

  describe('recordMetric', () => {
    it('should record a metric entry', () => {
      recordMetric('test-op', 100, true, { key: 'value' });
      const metrics = getRecentMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('test-op');
      expect(metrics[0].duration).toBe(100);
      expect(metrics[0].success).toBe(true);
    });
  });

  describe('timeOperation', () => {
    it('should time a successful operation', async () => {
      const result = await timeOperation('test-op', async () => {
        return 'result';
      });
      expect(result).toBe('result');
      const metrics = getRecentMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].success).toBe(true);
    });

    it('should time a failed operation', async () => {
      await expect(
        timeOperation('test-op', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
      const metrics = getRecentMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].success).toBe(false);
    });
  });

  describe('getMetricsStats', () => {
    it('should return stats for a metric', () => {
      recordMetric('test-op', 100, true);
      recordMetric('test-op', 200, true);
      recordMetric('test-op', 300, false);
      const stats = getMetricsStats('test-op');
      expect(stats.count).toBe(3);
      expect(stats.avgDuration).toBe(200);
      expect(stats.successRate).toBeCloseTo(0.667, 2);
    });

    it('should return zero stats for unknown metric', () => {
      const stats = getMetricsStats('unknown');
      expect(stats.count).toBe(0);
      expect(stats.avgDuration).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      recordMetric('test-op', 100, true);
      clearMetrics();
      const metrics = getRecentMetrics();
      expect(metrics).toHaveLength(0);
    });
  });
});
