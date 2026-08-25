/**
 * Mock fixture for window.gmpilot API.
 * Simulates Electron IPC responses for renderer-only testing.
 */

import { test as base, type Page } from '@playwright/test';

// Mock data
const MOCK_SETTINGS = {
  LLM_API_KEY: 'sk-test-key',
  LLM_BASE_URL: 'https://api.siliconflow.cn/v1',
  LLM_MODEL: 'deepseek-ai/DeepSeek-V3.2',
};

const MOCK_REPORTS = [
  {
    id: 1,
    title: '片剂重量偏差调查',
    deviation_id: 'DEV-001',
    deviation_type: 'deviation_analysis',
    content: JSON.stringify({
      deviationId: 'DEV-001',
      title: '片剂重量偏差调查',
      riskLevel: 'medium',
      riskScore: 45,
    }),
    risk_score: 45,
    risk_level: 'medium',
    created_at: '2026-06-08 10:00:00',
  },
  {
    id: 2,
    title: '原料纯度异常分析',
    deviation_id: 'DEV-002',
    deviation_type: 'deviation_analysis',
    content: JSON.stringify({
      deviationId: 'DEV-002',
      title: '原料纯度异常分析',
      riskLevel: 'high',
      riskScore: 78,
    }),
    risk_score: 78,
    risk_level: 'high',
    created_at: '2026-06-08 11:00:00',
  },
];

const MOCK_KNOWLEDGE_DOCS = [
  {
    id: 1,
    filename: '药品生产质量管理规范.txt',
    source: 'builtin',
    chunk_count: 42,
    created_at: '2026-06-08 09:00:00',
  },
  {
    id: 2,
    filename: '内部SOP-偏差处理.txt',
    source: 'user',
    chunk_count: 15,
    created_at: '2026-06-08 09:30:00',
  },
];

/**
 * Inject mock window.gmpilot API into the page.
 */
export async function mockGmpilotAPI(page: Page) {
  await page.addInitScript(() => {
    (window as any).gmpilot = {
      db: {
        getSettings: async () => ({
          LLM_API_KEY: 'sk-test-key',
          LLM_BASE_URL: 'https://api.siliconflow.cn/v1',
          LLM_MODEL: 'deepseek-ai/DeepSeek-V3.2',
        }),
        saveSettings: async () => undefined,
        getReports: async () => [
          {
            id: 1,
            title: '片剂重量偏差调查',
            deviation_id: 'DEV-001',
            deviation_type: 'deviation_analysis',
            content: '{}',
            risk_score: 45,
            risk_level: 'medium',
            created_at: '2026-06-08 10:00:00',
          },
          {
            id: 2,
            title: '原料纯度异常分析',
            deviation_id: 'DEV-002',
            deviation_type: 'deviation_analysis',
            content: '{}',
            risk_score: 78,
            risk_level: 'high',
            created_at: '2026-06-08 11:00:00',
          },
        ],
        getReport: async (id: number) => null,
        createReport: async () => 1,
        deleteReport: async () => undefined,
      },
      knowledge: {
        query: async () => [],
        listDocuments: async () => [
          {
            id: 1,
            filename: '药品生产质量管理规范.txt',
            source: 'builtin',
            chunk_count: 42,
            created_at: '2026-06-08 09:00:00',
          },
          {
            id: 2,
            filename: '内部SOP-偏差处理.txt',
            source: 'user',
            chunk_count: 15,
            created_at: '2026-06-08 09:30:00',
          },
        ],
        pickAndAdd: async () => ({
          success: true,
          docId: 3,
          chunkCount: 10,
          filename: '新文档.txt',
        }),
        deleteDocument: async () => ({ success: true }),
        getContext: async () => '（模拟法规上下文）',
        stats: async () => ({ docCount: 2, chunkCount: 57 }),
      },
      llm: {
        generate: async () => ({ success: true, text: '模拟 LLM 响应' }),
        stream: async () => ({ success: true }),
        onChunk: () => {},
        onDone: () => {},
        onError: () => {},
        offStream: () => {},
        getProviders: async () => [
          { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', defaultBaseUrl: 'https://api.deepseek.com/v1' },
          { id: 'qwen', name: '通义千问', defaultModel: 'qwen-plus', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
          { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o', defaultBaseUrl: 'https://api.openai.com/v1' },
          { id: 'mimo', name: 'Mimo', defaultModel: 'mimo-v2.5-pro', defaultBaseUrl: 'https://api.xiaomimimo.com/v1' },
        ],
        testProvider: async () => ({ success: true, latency: 150 }),
      },
      workflow: {
        runDeviation: async () => ({
          success: true,
          report: {
            deviationId: 'DEV-MOCK-001',
            title: '偏差调查报告',
            riskLevel: 'medium',
            riskScore: 45,
            background: { description: '模拟偏差背景' },
            investigation: { rootCause: '模拟根本原因' },
            riskAssessment: { description: '模拟风险评估' },
            capa: { corrections: [{ content: '模拟纠正措施' }] },
            conclusion: { summary: '模拟结论' },
          },
        }),
        exportPdf: async () => ({ success: true, filePath: '/tmp/report.pdf' }),
        onProgress: () => {},
        offProgress: () => {},
        onStreaming: () => {},
        offStreaming: () => {},
      },
      file: {
        pickAndRead: async () => ({
          success: true,
          content: '模拟文件内容',
          filePath: '/tmp/test.txt',
        }),
        exportPdf: async () => ({ success: true, filePath: '/tmp/report.pdf' }),
      },
      auditbee: {
        getAuditHistory: async () => [],
      },
    };
  });
}

export { MOCK_SETTINGS, MOCK_REPORTS, MOCK_KNOWLEDGE_DOCS };
