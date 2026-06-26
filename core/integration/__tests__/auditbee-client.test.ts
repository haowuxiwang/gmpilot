import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditBeeClient } from '../auditbee-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AuditBeeClient', () => {
  let client: AuditBeeClient;

  beforeEach(() => {
    client = new AuditBeeClient('http://localhost:8000');
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAvailable', () => {
    it('should return true when health check succeeds', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await client.isAvailable();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/health');
    });

    it('should return false when health check fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      const result = await client.isAvailable();
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await client.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('uploadDocument', () => {
    it('should upload document and return id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 42, filename: 'test.md' }),
      });

      const blob = new Blob(['test content']);
      const result = await client.uploadDocument(blob, 'test.md');
      expect(result.id).toBe(42);
    });
  });

  describe('createTask', () => {
    it('should create audit task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          task_name: 'Test Task',
          task_type: 'deviation_analysis',
          status: 'pending',
          progress: 0,
          created_at: '2026-01-01',
        }),
      });

      const task = await client.createTask({
        taskName: 'Test Task',
        taskType: 'deviation_analysis',
        documentIds: [1],
      });

      expect(task.id).toBe(1);
      expect(task.task_name).toBe('Test Task');
      expect(task.status).toBe('pending');
    });
  });

  describe('getFindings', () => {
    it('should return findings for a task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          {
            id: 1,
            task_id: 1,
            finding_type: 'compliance_risk',
            severity: 'high',
            title: 'Missing SOP reference',
            description: 'The report does not reference the relevant SOP.',
          },
        ]),
      });

      const findings = await client.getFindings(1);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('high');
    });
  });

  describe('getTask', () => {
    it('should return task status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          status: 'completed',
          progress: 100,
        }),
      });

      const task = await client.getTask(1);
      expect(task.status).toBe('completed');
    });
  });
});
