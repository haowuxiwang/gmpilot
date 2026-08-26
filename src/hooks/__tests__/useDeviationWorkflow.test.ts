/**
 * Tests for useDeviationWorkflow hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeviationWorkflow, STEP_MAP, resetWorkflowStoreForTests, resetWorkflowSubscriptionForTests } from '../useDeviationWorkflow';
import type { DeviationReport } from '@core/workflow/types';

// Mock window.gmpilot
const mockGmpilot = {
  workflow: {
    runDeviation: vi.fn(),
    cancel: vi.fn(),
    reviseTargeted: vi.fn(),
    onProgress: vi.fn(),
    offProgress: vi.fn(),
    onStreaming: vi.fn(),
    offStreaming: vi.fn(),
  },
  file: {
    exportPdf: vi.fn(),
  },
};

// Mock DeviationReport
const mockReport: DeviationReport = {
  report_type: 'full_report',
  title: '测试报告',
  report_metadata: {
    findings_count: 0,
    task_type: 'deviation_analysis',
    report_source: 'gmpilot_generate',
  },
  cover: {
    title: '偏差调查报告',
    titleEn: 'Deviation Report',
    department: '生产部',
    preparedBy: { department: '生产部', name: '张三', signatureDate: '2026-01-01' },
    reviewedBy: { department: '生产部', name: '李四', signatureDate: '2026-01-02' },
  },
  background: {
    product: '测试产品',
    batch: 'B001',
    occurrenceTime: '2026-01-01',
    location: '车间A',
    description: '测试偏差描述',
  },
  investigation: {
    rootCause: {
      factors: {
        man: '',
        machine: '',
        material: '',
        method: '',
        environment: '',
        measurement: '',
      },
      methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] },
      conclusion: '',
    },
    repeatDeviations: { records: [], analysis: '', conclusion: '' },
    otherProducts: { records: [], analysis: '', conclusion: '' },
  },
  conclusion: { rootCause: '测试原因' },
  riskAssessment: {
    description: '',
    summary: '',
  },
  capa: { corrections: [], preventions: [] },
  attachments: [],
  versionHistory: [],
  deviationId: 'DEV-001',
  riskScore: 50,
  riskLevel: 'medium',
  factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
  regulations: [],
  findings: [],
};

describe('useDeviationWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkflowStoreForTests();
    resetWorkflowSubscriptionForTests();
    // Setup window.gmpilot mock
    Object.defineProperty(window, 'gmpilot', {
      value: mockGmpilot,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore gmpilot to avoid cleanup errors
    Object.defineProperty(window, 'gmpilot', {
      value: mockGmpilot,
      writable: true,
      configurable: true,
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useDeviationWorkflow());

      expect(result.current.step).toBe('input');
      expect(result.current.clueText).toBe('');
      expect(result.current.report).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.progress).toBeNull();
      expect(result.current.auditFindings).toBeNull();
      expect(result.current.auditScore).toBeNull();
      expect(result.current.auditSummary).toBeNull();
    });
  });

  describe('STEP_MAP', () => {
    it('should map steps to correct numbers', () => {
      expect(STEP_MAP.input).toBe(0);
      expect(STEP_MAP.analyzing).toBe(1);
      expect(STEP_MAP.identifying).toBe(2);
      expect(STEP_MAP.matching).toBe(3);
      expect(STEP_MAP.generating).toBe(4);
      expect(STEP_MAP.auditing).toBe(5);
      expect(STEP_MAP.review).toBe(6);
      expect(STEP_MAP.done).toBe(6);
    });
  });

  describe('runWorkflow', () => {
    it('should return error for empty clue text', async () => {
      const onWarning = vi.fn();
      const { result } = renderHook(() => useDeviationWorkflow({ onWarning }));

      let response: Awaited<ReturnType<typeof result.current.runWorkflow>>;
      await act(async () => {
        response = await result.current.runWorkflow('');
      });

      expect(response?.success).toBe(false);
      expect(response?.error).toBe('请输入偏差线索');
      expect(onWarning).toHaveBeenCalledWith('请输入偏差线索');
    });

    it('should return error for whitespace-only clue text', async () => {
      const { result } = renderHook(() => useDeviationWorkflow());

      let response: Awaited<ReturnType<typeof result.current.runWorkflow>>;
      await act(async () => {
        response = await result.current.runWorkflow('   ');
      });

      expect(response?.success).toBe(false);
    });

    it('should run workflow successfully', async () => {
      const onSuccess = vi.fn();
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
        auditFindings: [{ title: 'finding1' }],
        auditScore: 85,
        auditSummary: '审核通过',
      });

      const { result } = renderHook(() => useDeviationWorkflow({ onSuccess }));

      let response: Awaited<ReturnType<typeof result.current.runWorkflow>>;
      await act(async () => {
        response = await result.current.runWorkflow('测试偏差线索');
      });

      expect(response?.success).toBe(true);
      expect(response?.report).toEqual(mockReport);
      expect(result.current.step).toBe('review');
      expect(result.current.report).toEqual(mockReport);
      expect(result.current.auditScore).toBe(85);
      expect(onSuccess).toHaveBeenCalledWith(mockReport);
    });

    it('should handle workflow failure', async () => {
      const onError = vi.fn();
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: false,
        error: 'LLM 调用失败',
      });

      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      let response: Awaited<ReturnType<typeof result.current.runWorkflow>>;
      await act(async () => {
        response = await result.current.runWorkflow('测试线索');
      });

      expect(response?.success).toBe(false);
      expect(response?.error).toBe('LLM 调用失败');
      expect(result.current.step).toBe('input');
      expect(result.current.error).toBe('LLM 调用失败');
      expect(onError).toHaveBeenCalledWith('LLM 调用失败');
    });

    it('should use default error message when error is missing', async () => {
      const onError = vi.fn();
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: false,
        // no error field
      });

      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      let response: Awaited<ReturnType<typeof result.current.runWorkflow>>;
      await act(async () => {
        response = await result.current.runWorkflow('测试线索');
      });

      expect(response?.success).toBe(false);
      expect(response?.error).toBe('工作流执行失败');
      expect(onError).toHaveBeenCalledWith('工作流执行失败');
    });

    it('should handle exception during workflow', async () => {
      const onError = vi.fn();
      mockGmpilot.workflow.runDeviation.mockRejectedValue(new Error('网络错误'));

      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      let response: Awaited<ReturnType<typeof result.current.runWorkflow>>;
      await act(async () => {
        response = await result.current.runWorkflow('测试线索');
      });

      expect(response?.success).toBe(false);
      expect(result.current.error).toContain('网络错误');
      expect(onError).toHaveBeenCalled();
    });

    it('should set loading state during workflow', async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockGmpilot.workflow.runDeviation.mockReturnValue(promise);

      const { result } = renderHook(() => useDeviationWorkflow());

      // Start workflow but don't await
      act(() => {
        result.current.runWorkflow('测试线索');
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.step).toBe('analyzing');

      // Resolve the promise
      await act(async () => {
        resolvePromise!({ success: true, report: mockReport });
      });

      expect(result.current.loading).toBe(false);
    });

    it('should use clueText state when no text provided', async () => {
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });

      const { result } = renderHook(() => useDeviationWorkflow());

      // Set clue text via state
      act(() => {
        result.current.setClueText('状态中的线索文本');
      });

      await act(async () => {
        await result.current.runWorkflow();
      });

      expect(mockGmpilot.workflow.runDeviation).toHaveBeenCalledWith('状态中的线索文本', undefined);
    });
  });

  describe('exportPdf', () => {
    it('should do nothing when no report', async () => {
      const { result } = renderHook(() => useDeviationWorkflow());

      await act(async () => {
        await result.current.exportPdf();
      });

      expect(mockGmpilot.file.exportPdf).not.toHaveBeenCalled();
    });

    it('should export PDF successfully', async () => {
      const onSuccess = vi.fn();
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });
      mockGmpilot.file.exportPdf.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useDeviationWorkflow({ onSuccess }));

      // First get a report
      await act(async () => {
        await result.current.runWorkflow('测试');
      });

      // Then export
      await act(async () => {
        await result.current.exportPdf();
      });

      expect(mockGmpilot.file.exportPdf).toHaveBeenCalledWith(mockReport);
    });

    it('should handle export failure', async () => {
      const onError = vi.fn();
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });
      mockGmpilot.file.exportPdf.mockResolvedValue({
        success: false,
        error: '写入文件失败',
      });

      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      await act(async () => {
        await result.current.runWorkflow('测试');
      });

      await act(async () => {
        await result.current.exportPdf();
      });

      expect(onError).toHaveBeenCalledWith('导出失败：写入文件失败');
    });

    it('should handle export failure without error message', async () => {
      const onError = vi.fn();
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });
      mockGmpilot.file.exportPdf.mockResolvedValue({
        success: false,
        // no error field
      });

      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      await act(async () => {
        await result.current.runWorkflow('测试');
      });

      await act(async () => {
        await result.current.exportPdf();
      });

      // onError should NOT be called since result.error is falsy
      expect(onError).not.toHaveBeenCalled();
    });

    it('should handle export exception', async () => {
      const onError = vi.fn();
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });
      mockGmpilot.file.exportPdf.mockRejectedValue(new Error('IPC error'));

      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      await act(async () => {
        await result.current.runWorkflow('测试');
      });

      await act(async () => {
        await result.current.exportPdf();
      });

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('IPC error'));
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
        auditFindings: [],
        auditScore: 90,
        auditSummary: '优秀',
      });

      const { result } = renderHook(() => useDeviationWorkflow());

      // Run workflow to set state
      await act(async () => {
        await result.current.runWorkflow('测试线索');
      });

      expect(result.current.report).not.toBeNull();

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.step).toBe('input');
      expect(result.current.clueText).toBe('');
      expect(result.current.report).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.progress).toBeNull();
      expect(result.current.auditFindings).toBeNull();
      expect(result.current.auditScore).toBeNull();
      expect(result.current.auditSummary).toBeNull();
    });
  });

  describe('progress subscription', () => {
    it('should subscribe to progress (app-lifetime singleton, survives route unmount)', () => {
      // 订阅是模块级一次性的：首个挂载触发，后续挂载不重复订阅。
      // 这是"切页不丢流程"的核心——卸载组件绝不能拆监听器。
      renderHook(() => useDeviationWorkflow());

      expect(mockGmpilot.workflow.onProgress).toHaveBeenCalled();
      expect(mockGmpilot.workflow.onStreaming).toHaveBeenCalled();

      const callsBefore = vi.mocked(mockGmpilot.workflow.onProgress).mock.calls.length;
      const { unmount } = renderHook(() => useDeviationWorkflow());
      unmount();
      // 卸载后不应新增订阅（也不应解绑）
      expect(vi.mocked(mockGmpilot.workflow.onProgress).mock.calls.length).toBe(callsBefore);
      expect(mockGmpilot.workflow.offProgress).not.toHaveBeenCalled();
    });

    it('should update state on progress callback', () => {
      let progressCallback: (data: unknown) => void;
      mockGmpilot.workflow.onProgress.mockImplementation((cb) => {
        progressCallback = cb;
      });

      const { result } = renderHook(() => useDeviationWorkflow());

      // Simulate progress update
      // stepNames = ['input', 'analyzing', 'identifying', 'matching', 'generating', 'auditing', 'review']
      // currentStep 5 -> stepNames[4] = 'generating'
      act(() => {
        progressCallback!({
          step: 'generating',
          currentStep: 5,
          analysis: null,
          factors: null,
          regulations: [],
          findings: [],
          report: null,
          error: null,
        });
      });

      expect(result.current.step).toBe('generating');
      expect(result.current.progress?.currentStep).toBe(5);
    });

    it('should update report on progress callback with report', () => {
      let progressCallback: (data: unknown) => void;
      mockGmpilot.workflow.onProgress.mockImplementation((cb) => {
        progressCallback = cb;
      });

      const { result } = renderHook(() => useDeviationWorkflow());

      act(() => {
        progressCallback!({
          step: 'review',
          currentStep: 7,
          analysis: null,
          factors: null,
          regulations: [],
          findings: [],
          report: mockReport,
          error: null,
        });
      });

      expect(result.current.report).toEqual(mockReport);
    });

    it('should set error on progress callback with error', () => {
      let progressCallback: (data: unknown) => void;
      mockGmpilot.workflow.onProgress.mockImplementation((cb) => {
        progressCallback = cb;
      });

      const { result } = renderHook(() => useDeviationWorkflow());

      act(() => {
        progressCallback!({
          step: 'analyzing',
          currentStep: 2,
          analysis: null,
          factors: null,
          regulations: [],
          findings: [],
          report: null,
          error: '进度中的错误',
        });
      });

      expect(result.current.error).toBe('进度中的错误');
    });

    it('should handle streaming callback', () => {
      let streamingCallback: (data: { partial: Partial<DeviationReport> }) => void;
      let progressCallback: (data: unknown) => void;
      mockGmpilot.workflow.onStreaming.mockImplementation((cb) => {
        streamingCallback = cb;
      });
      mockGmpilot.workflow.onProgress.mockImplementation((cb) => {
        progressCallback = cb;
      });

      const { result } = renderHook(() => useDeviationWorkflow());

      // First set progress so streaming can attach to it
      act(() => {
        progressCallback!({
          step: 'generating',
          currentStep: 5,
          analysis: null,
          factors: null,
          regulations: [],
          findings: [],
          report: null,
          error: null,
        });
      });

      // Then simulate streaming
      act(() => {
        streamingCallback!({ partial: { title: '流式报告' } });
      });

      expect(result.current.progress?.streamingReport?.title).toBe('流式报告');
    });
  });

  describe('without window.gmpilot', () => {
    it('should handle missing gmpilot API gracefully', async () => {
      // Temporarily remove gmpilot
      const originalGmpilot = window.gmpilot;
      // @ts-expect-error - simulate missing API
      delete window.gmpilot;

      const onWarning = vi.fn();
      const { result } = renderHook(() => useDeviationWorkflow({ onWarning }));

      let response: Awaited<ReturnType<typeof result.current.runWorkflow>>;
      await act(async () => {
        response = await result.current.runWorkflow('测试');
      });

      expect(response?.success).toBe(false);
      expect(onWarning).toHaveBeenCalledWith('请在 Electron 环境中运行');

      // Restore for cleanup
      window.gmpilot = originalGmpilot;
    });
  });

  describe('cancelWorkflow', () => {
    it('should cancel workflow successfully', async () => {
      mockGmpilot.workflow.cancel.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useDeviationWorkflow());

      await act(async () => {
        await result.current.cancelWorkflow();
      });

      expect(mockGmpilot.workflow.cancel).toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
      expect(result.current.step).toBe('input');
      expect(result.current.error).toBe('工作流已被用户取消');
    });

    it('should ignore cancel errors silently', async () => {
      mockGmpilot.workflow.cancel.mockRejectedValue(new Error('cancel failed'));

      const { result } = renderHook(() => useDeviationWorkflow());

      await act(async () => {
        await result.current.cancelWorkflow();
      });

      // Should not throw, state unchanged
      expect(result.current.step).toBe('input');
    });

    it('should handle cancel returning success false', async () => {
      mockGmpilot.workflow.cancel.mockResolvedValue({ success: false });

      const { result } = renderHook(() => useDeviationWorkflow());

      await act(async () => {
        await result.current.cancelWorkflow();
      });

      // State should not change since success is false
      expect(result.current.step).toBe('input');
      expect(result.current.error).toBeNull();
    });
  });

  describe('reviseTargeted', () => {
    it('should return error when no report exists', async () => {
      const { result } = renderHook(() => useDeviationWorkflow());

      let response: { success: boolean; error?: string };
      await act(async () => {
        response = await result.current.reviseTargeted(['background'], '修改背景');
      });

      expect(response!.success).toBe(false);
      expect(response!.error).toBe('没有可修订的报告');
    });

    it('should revise targeted modules successfully', async () => {
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });
      mockGmpilot.workflow.reviseTargeted.mockResolvedValue({
        success: true,
        report: { ...mockReport, title: '修订后报告' },
      });

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useDeviationWorkflow({ onSuccess }));

      // First get a report
      await act(async () => {
        await result.current.runWorkflow('测试');
      });

      // Then revise
      let response: { success: boolean; error?: string };
      await act(async () => {
        response = await result.current.reviseTargeted(['background'], '修改背景');
      });

      expect(response!.success).toBe(true);
      expect(result.current.report?.title).toBe('修订后报告');
      expect(result.current.step).toBe('review');
    });

    it('should handle revision failure', async () => {
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });
      mockGmpilot.workflow.reviseTargeted.mockResolvedValue({
        success: false,
        error: 'LLM 修订失败',
      });

      const onError = vi.fn();
      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      await act(async () => {
        await result.current.runWorkflow('测试');
      });

      let response: { success: boolean; error?: string };
      await act(async () => {
        response = await result.current.reviseTargeted(['capa'], '修改CAPA');
      });

      expect(response!.success).toBe(false);
      expect(response!.error).toBe('LLM 修订失败');
      expect(onError).toHaveBeenCalledWith('LLM 修订失败');
    });

    it('should handle revision exception', async () => {
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });
      mockGmpilot.workflow.reviseTargeted.mockRejectedValue(new Error('网络异常'));

      const onError = vi.fn();
      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      await act(async () => {
        await result.current.runWorkflow('测试');
      });

      let response: { success: boolean; error?: string };
      await act(async () => {
        response = await result.current.reviseTargeted(['conclusion'], '修改结论');
      });

      expect(response!.success).toBe(false);
      expect(response!.error).toContain('网络异常');
      expect(result.current.loading).toBe(false);
    });

    it('should handle revision success without report', async () => {
      mockGmpilot.workflow.runDeviation.mockResolvedValue({
        success: true,
        report: mockReport,
      });
      mockGmpilot.workflow.reviseTargeted.mockResolvedValue({
        success: true,
        // report is missing
      });

      const onError = vi.fn();
      const { result } = renderHook(() => useDeviationWorkflow({ onError }));

      await act(async () => {
        await result.current.runWorkflow('测试');
      });

      let response: { success: boolean; error?: string };
      await act(async () => {
        response = await result.current.reviseTargeted(['background'], '修改背景');
      });

      // Should fall into else branch since result.report is missing
      expect(response!.success).toBe(false);
      expect(response!.error).toBe('定向修订失败');
    });
  });
});
