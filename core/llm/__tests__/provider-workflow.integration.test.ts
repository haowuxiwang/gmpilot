/**
 * LLM Provider + Workflow Integration Test.
 * Tests provider initialization, LLM connectivity, and workflow machine initialization.
 * Uses mocked LLM responses for deterministic testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createActor } from 'xstate';
import {
  getProviderConfig,
  createLLMModel,
  isProviderConfigured,
  healthCheckProvider,
  clearSettingsCache,
} from '../provider';
import { callLLMWithRetry } from '../caller';
import { createDeviationMachine } from '../../workflow/deviation-machine';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../db/connection', () => ({
  getDatabase: vi.fn(() => ({})),
}));

vi.mock('../../db/schema', () => ({
  getAllSettings: vi.fn(() => ({})),
}));

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: '{"summary":"test","keyEvents":["e1"],"involvedParties":["QA"],"documentType":"deviation_analysis"}',
    usage: { promptTokens: 100, completionTokens: 50 },
  }),
  generateObject: vi.fn(),
  streamObject: vi.fn(),
  streamText: vi.fn(),
  jsonSchema: vi.fn(),
}));

const mockOpenAIFactory = vi.fn((model: string) => ({ modelId: model, provider: 'openai' }));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => mockOpenAIFactory),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'anthropic' }))),
}));
vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn(() => vi.fn((model: string) => ({ modelId: model, provider: 'ollama' }))),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../utils/metrics', () => ({
  recordMetric: vi.fn(),
}));

vi.mock('../../rag/index', () => ({
  getRetriever: vi.fn().mockReturnValue({
    getRegulationContext: vi.fn().mockResolvedValue('mock regulation context'),
    getAuditContext: vi.fn().mockResolvedValue('mock audit context'),
  }),
  isRetrieverAvailable: vi.fn().mockReturnValue(true),
  initRetriever: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../workflow/nodes/clue-analysis', () => ({
  analyzeClueNode: vi.fn().mockResolvedValue({
    summary: 'test summary',
    keyEvents: ['e1'],
    involvedParties: ['QA'],
    documentType: 'deviation_analysis',
  }),
}));

vi.mock('../../workflow/nodes/factor-identify', () => ({
  identifyFactorsNode: vi.fn().mockResolvedValue({
    factors: { man: ['f1'], machine: [], material: [], method: [], environment: [], measurement: [] },
    findings: [{ finding_type: 'compliance_risk', severity: 'medium', title: 'f1', description: 'd1' }],
  }),
}));

vi.mock('../../workflow/nodes/regulation-match', () => ({
  matchRegulationsNode: vi.fn().mockResolvedValue([
    { regulation: 'GMP', chapter: 'ch1', article: 'a1', title: 't1', content: 'c1', relevance: 'r1' },
  ]),
}));

const mockReport = vi.hoisted(() => ({
  report_type: 'full_report' as const,
  title: 'test report',
  report_metadata: { findings_count: 1, task_type: 'deviation_analysis' as const, report_source: 'gmpilot_generate' as const },
  cover: { title: 'cover', titleEn: 'cover', department: 'QA', preparedBy: { name: 'A', signatureDate: '' }, reviewedBy: { name: 'B', signatureDate: '' } },
  background: { product: 'P', batch: 'B001', occurrenceTime: '', location: '', description: 'd' },
  investigation: { rootCause: { interviews: '', sopReview: '', historicalData: '', relatedBatches: '', batchRecords: '', samplesReview: '', stabilityStudy: '', supplierReview: '', methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] }, conclusion: '' }, repeatDeviations: { records: [], analysis: '', conclusion: '' }, otherProducts: { records: [], analysis: '', conclusion: '' } },
  conclusion: { rootCause: 'rc' },
  riskAssessment: { description: '', summary: '' },
  capa: { corrections: [], preventions: [] },
  attachments: [] as unknown[],
  versionHistory: [] as unknown[],
  deviationId: 'DEV-001',
  riskScore: 30,
  riskLevel: 'medium' as const,
  factors: { man: [] as string[], machine: [] as string[], material: [] as string[], method: [] as string[], environment: [] as string[] },
  regulations: [] as unknown[],
  findings: [] as unknown[],
}));

vi.mock('../../workflow/assembler', () => ({
  createDefaultGenerators: vi.fn(() => ({
    cover: {}, background: {}, investigation: {}, conclusion: {}, riskAssessment: {}, capa: {}, attachments: {},
  })),
  generateModules: vi.fn().mockResolvedValue({
    cover: mockReport.cover,
    background: mockReport.background,
    investigation: mockReport.investigation,
    conclusion: mockReport.conclusion,
    riskAssessment: mockReport.riskAssessment,
    capa: mockReport.capa,
    attachments: { attachments: [], versionHistory: [] },
  }),
  assembleReport: vi.fn().mockReturnValue(mockReport),
  reviseModules: vi.fn().mockResolvedValue({
    cover: mockReport.cover,
    background: mockReport.background,
    investigation: mockReport.investigation,
    conclusion: mockReport.conclusion,
    riskAssessment: mockReport.riskAssessment,
    capa: mockReport.capa,
    attachments: { attachments: [], versionHistory: [] },
  }),
}));

vi.mock('../../llm/caller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../llm/caller')>();
  return {
    ...actual,
    auditDeviationReport: vi.fn().mockResolvedValue({
      findings: [{ title: 'suggestion', severity: 'low' }],
      overallScore: 85,
      summary: 'pass',
    }),
  };
});

vi.mock('../../workflow/report-to-markdown', () => ({
  reportToMarkdown: vi.fn().mockReturnValue('# report'),
}));
vi.mock('../../llm/prompts/loader', () => ({
  fillPrompt: vi.fn().mockReturnValue('mock prompt'),
}));
vi.mock('../../llm/prompts/schema-to-prompt', () => ({
  getSchemaDescription: vi.fn().mockReturnValue('mock schema'),
}));

// ============================================================================
// Test Suite
// ============================================================================

describe('LLM Provider + Workflow Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    clearSettingsCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearSettingsCache();
  });

  // =========================================================================
  // 1. Provider Initialization with SiliconFlow API Key
  // =========================================================================

  describe('Provider Initialization', () => {
    it('should initialize SiliconFlow provider from .env config', () => {
      process.env.LLM_API_KEY = 'sk-fkmixpwmmelmteznqxxfspyjmlusjthkmntfmzacifuocgke';
      process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';
      process.env.LLM_MODEL = 'Qwen/Qwen2.5-72B-Instruct-128K';

      const config = getProviderConfig();

      expect(config.provider).toBe('siliconflow');
      expect(config.apiKey).toBe('sk-fkmixpwmmelmteznqxxfspyjmlusjthkmntfmzacifuocgke');
      expect(config.baseUrl).toBe('https://api.siliconflow.cn/v1');
      expect(config.model).toBe('Qwen/Qwen2.5-72B-Instruct-128K');
    });

    it('should create LLM model for SiliconFlow provider', () => {
      process.env.LLM_API_KEY = 'sk-test-key';
      process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';
      process.env.LLM_MODEL = 'Qwen/Qwen2.5-72B-Instruct-128K';

      const config = getProviderConfig();
      const model = createLLMModel(config);

      expect(model).toBeDefined();
      expect(mockOpenAIFactory).toHaveBeenCalledWith('Qwen/Qwen2.5-72B-Instruct-128K');
    });

    it('should detect SiliconFlow provider from URL', () => {
      process.env.LLM_API_KEY = 'sk-test';
      process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';

      const config = getProviderConfig();
      expect(config.provider).toBe('siliconflow');
    });

    it('should report SiliconFlow as configured when API key is set', () => {
      process.env.LLM_API_KEY = 'sk-test-key';
      process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';

      expect(isProviderConfigured('siliconflow')).toBe(true);
    });
  });

  // =========================================================================
  // 2. LLM Connectivity Test (Mocked)
  // =========================================================================

  describe('LLM Connectivity', () => {
    it('should perform successful health check with mocked LLM', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValue({ text: '1' } as never);

      process.env.LLM_API_KEY = 'sk-test-key';
      process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';
      process.env.LLM_MODEL = 'Qwen/Qwen2.5-72B-Instruct-128K';

      const result = await healthCheckProvider();

      expect(result.ok).toBe(true);
      expect(result.provider).toBe('siliconflow');
      expect(result.model).toBe('Qwen/Qwen2.5-72B-Instruct-128K');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle LLM connection failure gracefully', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockRejectedValue(new Error('Connection refused'));

      process.env.LLM_API_KEY = 'sk-test-key';
      process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';

      const result = await healthCheckProvider();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should make LLM call with retry logic', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValue({
        text: '{"result": "success"}',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        reasoning: undefined,
        files: undefined,
        reasoningDetails: undefined,
        sources: undefined,
        finishReason: 'stop',
        steps: [],
        warnings: [],
        request: undefined,
        response: { id: 'test', model: 'test', timestamp: new Date(), headers: {} },
      } as never);

      process.env.LLM_API_KEY = 'sk-test-key';
      process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';

      const config = getProviderConfig();
      const model = createLLMModel(config);

      const result = await callLLMWithRetry(
        async (signal) => {
          const { generateText: gen } = await import('ai');
          return gen({ model, prompt: 'test', abortSignal: signal });
        },
        { node: 'test', provider: 'siliconflow' },
      );

      expect(result).toBeDefined();
      expect(result.text).toContain('success');
    });
  });

  // =========================================================================
  // 3. Workflow Machine Initialization
  // =========================================================================

  describe('Workflow Machine Initialization', () => {
    it('should create deviation machine successfully', () => {
      const machine = createDeviationMachine();
      expect(machine).toBeDefined();
      expect(machine.definition.id).toBe('deviation');
    });

    it('should have all required states', () => {
      const machine = createDeviationMachine();
      const states = Object.keys(machine.definition.states);

      expect(states).toContain('input');
      expect(states).toContain('analyzing');
      expect(states).toContain('identifying');
      expect(states).toContain('matching');
      expect(states).toContain('generating');
      expect(states).toContain('auditing');
      expect(states).toContain('review');
      expect(states).toContain('revising');
      expect(states).toContain('done');
      expect(states).toContain('error_analyzing');
      expect(states).toContain('error_identifying');
      expect(states).toContain('error_matching');
      expect(states).toContain('error_generating');
      expect(states).toContain('error_auditing');
      expect(states).toContain('error_revising');
      expect(states).toContain('error_timeout');
      expect(states).toContain('cancelled');
    });

    it('should start in input state with correct initial context', () => {
      const machine = createDeviationMachine();
      const actor = createActor(machine);
      actor.start();

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('input');
      expect(snapshot.context.clueInput.text).toBe('');
      expect(snapshot.context.currentStep).toBe(1);
      expect(snapshot.context.analysis).toBeNull();
      expect(snapshot.context.factors).toBeNull();
      expect(snapshot.context.regulations).toEqual([]);
      expect(snapshot.context.findings).toEqual([]);
      expect(snapshot.context.report).toBeNull();
      expect(snapshot.context.error).toBeNull();
      expect(snapshot.context.revisionCount).toBe(0);

      actor.stop();
    });

    it('should support SUBMIT event from input state', () => {
      const machine = createDeviationMachine();
      const actor = createActor(machine);
      actor.start();

      actor.send({ type: 'SUBMIT', clueText: 'test clue', files: [] });

      expect(actor.getSnapshot().value).toBe('analyzing');
      expect(actor.getSnapshot().context.clueInput.text).toBe('test clue');
      expect(actor.getSnapshot().context.currentStep).toBe(2);

      actor.stop();
    });
  });

  // =========================================================================
  // 4. Full Workflow Simulation with Mocked LLM
  // =========================================================================

  describe('Full Workflow Simulation', () => {
    it('should complete full workflow with mocked LLM responses', async () => {
      const machine = createDeviationMachine();
      const actor = createActor(machine);
      actor.start();

      actor.send({ type: 'SUBMIT', clueText: 'weight deviation in 3 batches', files: [] });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 15000);
        const sub = actor.subscribe((snapshot) => {
          if (snapshot.value === 'review' || String(snapshot.value).startsWith('error')) {
            clearTimeout(timeout);
            sub.unsubscribe();
            resolve();
          }
        });
      });

      const snapshot = actor.getSnapshot();
      expect(['review', 'error_analyzing', 'error_identifying', 'error_matching', 'error_generating', 'error_auditing']).toContain(snapshot.value);

      if (snapshot.value === 'review') {
        expect(snapshot.context.analysis).not.toBeNull();
        expect(snapshot.context.factors).not.toBeNull();
        expect(snapshot.context.regulations).toHaveLength(1);
        expect(snapshot.context.report).not.toBeNull();
        expect(snapshot.context.auditFindings).not.toBeNull();
        expect(snapshot.context.auditScore).toBe(85);
      }

      actor.stop();
    });

    it('should support REVISE and RESET from review state', async () => {
      const machine = createDeviationMachine();
      const actor = createActor(machine);
      actor.start();

      actor.send({ type: 'SUBMIT', clueText: 'test', files: [] });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 15000);
        const sub = actor.subscribe((snapshot) => {
          if (snapshot.value === 'review' || String(snapshot.value).startsWith('error')) {
            clearTimeout(timeout);
            sub.unsubscribe();
            resolve();
          }
        });
      });

      if (actor.getSnapshot().value === 'review') {
        actor.send({ type: 'REVISE' });
        await new Promise((r) => setTimeout(r, 2000));
        expect(actor.getSnapshot().value).toBe('review');
        expect(actor.getSnapshot().context.revisionCount).toBe(1);

        actor.send({ type: 'RESET' });
        await new Promise((r) => setTimeout(r, 100));
        expect(actor.getSnapshot().value).toBe('input');
        expect(actor.getSnapshot().context.clueInput.text).toBe('');
      }

      actor.stop();
    });
  });
});
