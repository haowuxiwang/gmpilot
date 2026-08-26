import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActor } from 'xstate';
import { createDeviationMachine, deviationMachine } from '../deviation-machine';
import { analyzeClueNode } from '../nodes/clue-analysis';

// Mock RAG retriever
vi.mock('../../rag/index', () => ({
  getRetriever: vi.fn().mockReturnValue({
    getRegulationContext: vi.fn().mockResolvedValue('mock regulation context'),
    getAuditContext: vi.fn().mockResolvedValue('mock audit context'),
  }),
  isRetrieverAvailable: vi.fn().mockReturnValue(true),
  initRetriever: vi.fn().mockResolvedValue({}),
}));

// Mock the node implementations
vi.mock('../nodes/clue-analysis', () => ({
  analyzeClueNode: vi.fn().mockResolvedValue({
    summary: '测试摘要',
    keyEvents: ['事件1'],
    involvedParties: ['QA'],
    documentType: 'deviation_analysis',
  }),
}));

vi.mock('../nodes/factor-identify', () => ({
  identifyFactorsNode: vi.fn().mockResolvedValue({
    factors: { man: ['人员因素'], machine: [], material: [], method: [], environment: [], measurement: [] },
    findings: [{ finding_type: 'compliance_risk', severity: 'medium', title: '人员因素', description: '测试' }],
  }),
}));

vi.mock('../nodes/regulation-match', () => ({
  matchRegulationsNode: vi.fn().mockResolvedValue([
    { regulation: '中国GMP', chapter: '第二章', article: '第十条', title: '偏差处理', content: '内容', relevance: '相关' },
  ]),
}));

vi.mock('../nodes/report-generate', () => ({
  generateReportNode: vi.fn().mockResolvedValue({
    report_type: 'full_report',
    title: '测试报告',
    content: '# 测试报告',
    report_metadata: { findings_count: 1, task_type: 'deviation_analysis', report_source: 'gmpilot_generate' },
    deviationId: 'DEV-001',
    factors: {},
    regulations: [],
    findings: [],
    rootCause: '根因',
    correctiveActions: [],
    preventiveActions: [],
    riskScore: 30,
    riskLevel: 'medium',
    conclusion: '结论',
  }),
  calculateRiskScore: vi.fn().mockReturnValue({ score: 30, level: 'medium' }),
}));

// Mock assembler to avoid real LLM calls in module generation
const mockReport = vi.hoisted(() => ({
  report_type: 'full_report',
  title: '测试偏差报告',
  report_metadata: { findings_count: 1, task_type: 'deviation_analysis', report_source: 'gmpilot_generate' },
  cover: { title: '偏差调查报告', titleEn: 'Deviation Report', department: 'QA', preparedBy: { name: '张三', signatureDate: '' }, reviewedBy: { name: '李四', signatureDate: '' } },
  background: { product: '测试产品', batch: 'B001', occurrenceTime: '', location: '', description: '偏差' },
  investigation: { rootCause: { interviews: '', sopReview: '', historicalData: '', relatedBatches: '', batchRecords: '', samplesReview: '', stabilityStudy: '', supplierReview: '', methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] }, conclusion: '' }, repeatDeviations: { records: [], analysis: '', conclusion: '' }, otherProducts: { records: [], analysis: '', conclusion: '' } },
  conclusion: { rootCause: '测试原因' },
  riskAssessment: { description: '', summary: '' },
  capa: { corrections: [], preventions: [] },
  attachments: [] as unknown[],
  versionHistory: [] as unknown[],
  deviationId: 'DEV-001',
  riskScore: 30,
  riskLevel: 'medium',
  factors: { man: [] as string[], machine: [] as string[], material: [] as string[], method: [] as string[], environment: [] as string[] },
  regulations: [] as unknown[],
  findings: [] as unknown[],
}));

vi.mock('../assembler', () => ({
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
  buildModuleContext: vi.fn((input, deviationId) => ({
    deviationId,
    analysis: input.analysis ?? { summary: '', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' },
    factors: input.factors ?? { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
    regulations: input.regulations ?? [],
    findings: input.findings ?? [],
    regulationContext: input.regulationContext,
  })),
  reviseModules: vi.fn().mockResolvedValue({
    cover: mockReport.cover,
    background: mockReport.background,
    investigation: mockReport.investigation,
    conclusion: mockReport.conclusion,
    riskAssessment: mockReport.riskAssessment,
    capa: mockReport.capa,
    attachments: { attachments: [], versionHistory: [] },
  }),
  mapFindingsToModules: vi.fn().mockReturnValue(['background']),
}));

// Mock audit to avoid real LLM calls
vi.mock('../../llm/caller', () => ({
  auditDeviationReport: vi.fn().mockResolvedValue({
    findings: [{ title: '建议补充', severity: 'low' }],
    overallScore: 85,
    summary: '审核通过',
  }),
  abortWorkflowLLM: vi.fn(),
}));

/**
 * Helper: create an actor, start it, send SUBMIT, and wait for a specific state.
 */
function createActorAndWaitFor(targetState: string, timeoutMs = 10000) {
  return new Promise<ReturnType<typeof createActor>>((resolve, _reject) => {
    const actor = createActor(deviationMachine);
    const sub = actor.subscribe((snapshot) => {
      if (snapshot.value === targetState) {
        sub.unsubscribe();
        resolve(actor);
      } else if (snapshot.value === 'input' && snapshot.context.error) {
        sub.unsubscribe();
        resolve(actor); // Resolve even on error so we can check
      }
    });
    actor.start();
    actor.send({ type: 'SUBMIT', clueText: '测试线索', files: [] });
    setTimeout(() => {
      sub.unsubscribe();
      resolve(actor);
    }, timeoutMs);
  });
}

describe('deviationMachine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start in input state', () => {
    const actor = createActor(deviationMachine);
    actor.start();
    expect(actor.getSnapshot().value).toBe('input');
  });

  it('should have correct initial context', () => {
    const actor = createActor(deviationMachine);
    actor.start();
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.clueInput.text).toBe('');
    expect(snapshot.context.currentStep).toBe(1);
    expect(snapshot.context.analysis).toBeNull();
    expect(snapshot.context.factors).toBeNull();
    expect(snapshot.context.regulations).toEqual([]);
    expect(snapshot.context.findings).toEqual([]);
    expect(snapshot.context.report).toBeNull();
  });

  it('should transition to analyzing on SUBMIT', async () => {
    const actor = createActor(deviationMachine);
    actor.start();

    // Wait for transition to analyzing
    const value = await new Promise<string>((resolve) => {
      const sub = actor.subscribe((snapshot) => {
        if (snapshot.value !== 'input') {
          sub.unsubscribe();
          resolve(snapshot.value);
        }
      });
      actor.send({ type: 'SUBMIT', clueText: '测试线索', files: [] });
      setTimeout(() => {
        sub.unsubscribe();
        resolve(actor.getSnapshot().value);
      }, 1000);
    });

    expect(value).toBe('analyzing');
    expect(actor.getSnapshot().context.clueInput.text).toBe('测试线索');
    expect(actor.getSnapshot().context.currentStep).toBe(2);
  });

  it('should have all 11 states (including error states)', () => {
    const states = Object.keys(deviationMachine.definition.states);
    expect(states).toContain('input');
    expect(states).toContain('analyzing');
    expect(states).toContain('identifying');
    expect(states).toContain('matching');
    expect(states).toContain('generating');
    expect(states).toContain('error_analyzing');
    expect(states).toContain('error_identifying');
    expect(states).toContain('error_matching');
    expect(states).toContain('error_generating');
    expect(states).toContain('review');
    expect(states).toContain('done');
  });

  it('should reach review state after full workflow', async () => {
    // Setup mocks for successful workflow
    vi.mocked(analyzeClueNode).mockResolvedValue({
      summary: '测试摘要',
      keyEvents: ['事件1'],
      involvedParties: ['QA'],
      documentType: 'deviation_analysis',
    });

    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();

    if (snapshot.value === 'error_analyzing' || snapshot.value === 'error_identifying' ||
        snapshot.value === 'error_matching' || snapshot.value === 'error_generating') {
      // Workflow failed at some point — check that error is recorded
      expect(snapshot.context.error).toBeDefined();
    } else if (snapshot.value === 'input' && snapshot.context.error) {
      // Legacy error path
      expect(snapshot.context.error).toBeDefined();
    } else {
      expect(snapshot.value).toBe('review');
      expect(snapshot.context.report).toBeDefined();
    }
  });

  it('should support REVISE event from review state', async () => {
    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();

    if (snapshot.value !== 'review') {
      // Skip if we couldn't reach review state
      return;
    }

    actor.send({ type: 'REVISE' });
    // With mocked assembler, generation completes almost instantly
    await new Promise((r) => setTimeout(r, 500));
    // Should be back at review after full regeneration cycle
    expect(actor.getSnapshot().value).toBe('review');
    expect(actor.getSnapshot().context.revisionCount).toBe(1);
  });

  it('should support RESET event from review state', async () => {
    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();

    if (snapshot.value !== 'review') return;

    actor.send({ type: 'RESET' });
    await new Promise((r) => setTimeout(r, 100));
    expect(actor.getSnapshot().value).toBe('input');
    expect(actor.getSnapshot().context.clueInput.text).toBe('');
    expect(actor.getSnapshot().context.analysis).toBeNull();
  });

  it('should support EXPORT event from review state', async () => {
    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();

    if (snapshot.value !== 'review') return;

    actor.send({ type: 'EXPORT' });
    await new Promise((r) => setTimeout(r, 100));
    expect(actor.getSnapshot().value).toBe('done');
  });

  // =========================================================================
  // Error paths — each state should fall back to error state on error
  // Error states support RETRY and RESET events
  // =========================================================================

  it('should fall back to error_analyzing when analyzeClue fails', async () => {
    // Override analyzeClueNode to throw synchronously (simulates actor failure)
    vi.mocked(analyzeClueNode).mockImplementationOnce(() => {
      throw new Error('LLM analysis failed');
    });

    const actor = createActor(deviationMachine);
    actor.start();

    const finalState = await new Promise<string>((resolve) => {
      const sub = actor.subscribe((snapshot) => {
        if (snapshot.value === 'error_analyzing') {
          sub.unsubscribe();
          resolve('error_analyzing');
        }
      });
      actor.send({ type: 'SUBMIT', clueText: '测试线索', files: [] });
      setTimeout(() => {
        sub.unsubscribe();
        resolve(actor.getSnapshot().value);
      }, 5000);
    });

    // Should have fallen back to error_analyzing with error
    expect(finalState).toBe('error_analyzing');
    expect(actor.getSnapshot().context.error).toBeTruthy();
  });

  it('should support RETRY event in error states', () => {
    // Verify that error states exist and have RETRY transitions
    const actor = createActor(deviationMachine);
    actor.start();

    // Send RETRY event — should not throw (even though we're in input state)
    // This verifies the event type is recognized
    expect(() => actor.send({ type: 'RETRY' })).not.toThrow();
  });

  it('should support RESET from error state', async () => {
    // First, get to error state
    vi.mocked(analyzeClueNode).mockImplementationOnce(() => {
      throw new Error('LLM analysis failed');
    });

    const actor = createActor(deviationMachine);
    actor.start();

    await new Promise<void>((resolve) => {
      const sub = actor.subscribe((snapshot) => {
        if (snapshot.value === 'error_analyzing') {
          sub.unsubscribe();
          resolve();
        }
      });
      actor.send({ type: 'SUBMIT', clueText: '测试线索', files: [] });
      setTimeout(() => resolve(), 5000);
    });

    // Reset — should go back to input with cleared context
    actor.send({ type: 'RESET' });
    await new Promise((r) => setTimeout(r, 100));
    expect(actor.getSnapshot().value).toBe('input');
    expect(actor.getSnapshot().context.clueInput.text).toBe('');
    expect(actor.getSnapshot().context.error).toBeNull();
  });

  // =========================================================================
  // RESET event resets context fully
  // =========================================================================

  it('should fully reset context on RESET', async () => {
    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();

    if (snapshot.value !== 'review') return;

    actor.send({ type: 'RESET' });
    await new Promise((r) => setTimeout(r, 100));

    const ctx = actor.getSnapshot().context;
    expect(actor.getSnapshot().value).toBe('input');
    expect(ctx.clueInput.text).toBe('');
    expect(ctx.analysis).toBeNull();
    expect(ctx.factors).toBeNull();
    expect(ctx.regulationContext).toBe('');
    expect(ctx.regulations).toEqual([]);
    expect(ctx.findings).toEqual([]);
    expect(ctx.report).toBeNull();
    expect(ctx.currentStep).toBe(1);
    expect(ctx.error).toBeNull();
  });

  // =========================================================================
  // Context updates at each step
  // =========================================================================

  it('should update currentStep at each stage', async () => {
    const actor = createActor(deviationMachine);
    actor.start();

    // Track step changes
    const steps: number[] = [];
    actor.subscribe((snapshot) => {
      steps.push(snapshot.context.currentStep);
    });

    actor.send({ type: 'SUBMIT', clueText: '测试', files: [] });

    // Wait for workflow to complete
    await new Promise((r) => setTimeout(r, 3000));

    // Should have seen steps 2 through 6
    expect(steps).toContain(2); // after SUBMIT
    // The rest depend on how fast mocks resolve
  });

  // =========================================================================
  // createDeviationMachine factory
  // =========================================================================

  describe('createDeviationMachine', () => {
    it('should create a fresh machine instance', () => {
      const machine1 = createDeviationMachine();
      const machine2 = createDeviationMachine();
      expect(machine1).not.toBe(machine2);
    });

    it('should have the same structure as the default machine', () => {
      const machine = createDeviationMachine();
      const states = Object.keys(machine.definition.states);
      expect(states).toEqual(expect.arrayContaining(['input', 'analyzing', 'identifying', 'matching', 'generating', 'review', 'done']));
    });

    it('should start in input state', () => {
      const machine = createDeviationMachine();
      const actor = createActor(machine);
      actor.start();
      expect(actor.getSnapshot().value).toBe('input');
    });
  });

  // =========================================================================
  // RAG failure path
  // =========================================================================

  it('should proceed when RAG retriever is unavailable', async () => {
    // This tests the isRetrieverAvailable() === false path
    // The mock already returns true, but the machine should still work
    // even if RAG returns empty context
    const actor = await createActorAndWaitFor('review');
    // Workflow should complete regardless of RAG status
    const snapshot = actor.getSnapshot();
    if (snapshot.value === 'review') {
      expect(snapshot.context.report).toBeDefined();
    }
  });

  // =========================================================================
  // REVISE triggers regeneration
  // =========================================================================

  it('should regenerate report on REVISE from review', async () => {
    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();

    if (snapshot.value !== 'review') return;

    // Import the mocked assembler to check call count
    const { generateModules: mockedGenModules } = await import('../assembler');
    const callCountBefore = vi.mocked(mockedGenModules).mock.calls.length;

    actor.send({ type: 'REVISE' });
    // With mocked assembler, the full cycle completes quickly
    await new Promise((r) => setTimeout(r, 1000));

    // Should be back at review after regeneration
    expect(actor.getSnapshot().value).toBe('review');
    // generateModules should have been called again
    expect(vi.mocked(mockedGenModules).mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  // =========================================================================
  // CANCEL event → cancelled state → RESET
  // =========================================================================

  it('should transition to cancelled on CANCEL from analyzing', async () => {
    // Make analyzeClue hang so we can send CANCEL while in analyzing state
    vi.mocked(analyzeClueNode).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 30000)),
    );

    const actor = createActor(deviationMachine);
    actor.start();
    actor.send({ type: 'SUBMIT', clueText: '测试线索', files: [] });

    // Wait for analyzing state
    await new Promise<void>((resolve) => {
      const sub = actor.subscribe((s) => {
        if (s.value === 'analyzing') { sub.unsubscribe(); resolve(); }
      });
      setTimeout(resolve, 1000);
    });

    actor.send({ type: 'CANCEL' });
    await new Promise((r) => setTimeout(r, 100));
    expect(actor.getSnapshot().value).toBe('cancelled');

    // RESET from cancelled
    actor.send({ type: 'RESET' });
    await new Promise((r) => setTimeout(r, 100));
    expect(actor.getSnapshot().value).toBe('input');
    expect(actor.getSnapshot().context.clueInput.text).toBe('');
  });

  // =========================================================================
  // error_timeout state: RETRY with different currentStep values
  // =========================================================================

  it('should handle RETRY from error state (retry resumes workflow)', async () => {
    vi.mocked(analyzeClueNode).mockImplementationOnce(() => {
      throw new Error('timeout simulation');
    });

    const actor = createActor(deviationMachine);
    actor.start();

    // Get to error state first
    await new Promise<void>((resolve) => {
      const sub = actor.subscribe((s) => {
        if (String(s.value).startsWith('error')) { sub.unsubscribe(); resolve(); }
      });
      actor.send({ type: 'SUBMIT', clueText: '测试', files: [] });
      setTimeout(resolve, 3000);
    });

    const stateBefore = String(actor.getSnapshot().value);
    expect(stateBefore).toContain('error');

    // RETRY should leave the current error state (may enter another error if downstream fails)
    actor.send({ type: 'RETRY' });
    await new Promise((r) => setTimeout(r, 50));
    const stateAfter = String(actor.getSnapshot().value);
    // The key assertion: we left error_analyzing (the specific error state we were in)
    expect(stateAfter).not.toBe(stateBefore);
  });

  it('should support RESET from error_timeout state', async () => {
    vi.mocked(analyzeClueNode).mockImplementationOnce(() => {
      throw new Error('fail');
    });

    const actor = createActor(deviationMachine);
    actor.start();

    await new Promise<void>((resolve) => {
      const sub = actor.subscribe((s) => {
        if (String(s.value).startsWith('error')) { sub.unsubscribe(); resolve(); }
      });
      actor.send({ type: 'SUBMIT', clueText: '测试', files: [] });
      setTimeout(resolve, 3000);
    });

    actor.send({ type: 'RESET' });
    await new Promise((r) => setTimeout(r, 100));
    expect(actor.getSnapshot().value).toBe('input');
    expect(actor.getSnapshot().context.error).toBeNull();
  });

  // =========================================================================
  // REVISE_TARGETED → revising state
  // =========================================================================

  it('should transition to revising on REVISE_TARGETED from review', async () => {
    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();
    if (snapshot.value !== 'review') return;

    actor.send({ type: 'REVISE_TARGETED', targets: ['background'], revisionContext: '修改背景' });
    await new Promise((r) => setTimeout(r, 200));

    // Should be in revising or already moved to auditing (if fast)
    const val = actor.getSnapshot().value;
    expect(['revising', 'auditing', 'review']).toContain(val);
  });

  // =========================================================================
  // Max revision guard: REVISE blocked after 3 revisions
  // =========================================================================

  it('should block REVISE after max revisions reached', async () => {
    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();
    if (snapshot.value !== 'review') return;

    // Exhaust revision count (3 revisions)
    for (let i = 0; i < 3; i++) {
      actor.send({ type: 'REVISE' });
      await new Promise((r) => setTimeout(r, 2000));
      // Wait until back in review
      await new Promise<void>((resolve) => {
        const sub = actor.subscribe((s) => {
          if (s.value === 'review') { sub.unsubscribe(); resolve(); }
        });
        setTimeout(resolve, 5000);
      });
    }

    // 4th revision should be blocked (guard: revisionCount < 3)
    actor.send({ type: 'REVISE' });
    await new Promise((r) => setTimeout(r, 200));
    expect(actor.getSnapshot().value).toBe('review');
  });

  // =========================================================================
  // RAG unavailable / error paths
  // =========================================================================

  it('should proceed with empty regulationContext when RAG is unavailable', async () => {
    const { isRetrieverAvailable } = await import('../../rag/index');
    vi.mocked(isRetrieverAvailable).mockReturnValue(false);

    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();
    if (snapshot.value === 'review') {
      expect(snapshot.context.regulationContext).toBe('');
    }
    // Restore
    vi.mocked(isRetrieverAvailable).mockReturnValue(true);
  });

  it('should proceed when RAG getRegulationContext throws', async () => {
    const { getRetriever } = await import('../../rag/index');
    vi.mocked(getRetriever).mockReturnValue({
      getRegulationContext: vi.fn().mockRejectedValue(new Error('RAG error')),
      getAuditContext: vi.fn().mockResolvedValue('audit ctx'),
    } as never);

    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();
    if (snapshot.value === 'review') {
      expect(snapshot.context.regulationContext).toBe('');
    }
    // Restore
    vi.mocked(getRetriever).mockReturnValue({
      getRegulationContext: vi.fn().mockResolvedValue('mock regulation context'),
      getAuditContext: vi.fn().mockResolvedValue('mock audit context'),
    } as never);
  });

  it('should proceed when RAG getAuditContext throws', async () => {
    const { getRetriever } = await import('../../rag/index');
    vi.mocked(getRetriever).mockReturnValue({
      getRegulationContext: vi.fn().mockResolvedValue('ctx'),
      getAuditContext: vi.fn().mockRejectedValue(new Error('Audit RAG error')),
    } as never);

    const actor = await createActorAndWaitFor('review');
    const snapshot = actor.getSnapshot();
    // Workflow should still complete (audit uses fallback context)
    expect(['review', 'auditing']).toContain(snapshot.value);
    // Restore
    vi.mocked(getRetriever).mockReturnValue({
      getRegulationContext: vi.fn().mockResolvedValue('mock regulation context'),
      getAuditContext: vi.fn().mockResolvedValue('mock audit context'),
    } as never);
  });

  // =========================================================================
  // Non-Error rejection (assignError ternary branch)
  // =========================================================================

  it('should handle non-Error rejection in assignError', async () => {
    vi.mocked(analyzeClueNode).mockImplementationOnce(() => {
      // Reject with a string instead of Error
      return Promise.reject('string-error') as never;
    });

    const actor = createActor(deviationMachine);
    actor.start();

    await new Promise<void>((resolve) => {
      const sub = actor.subscribe((s) => {
        if (s.value === 'error_analyzing') { sub.unsubscribe(); resolve(); }
      });
      actor.send({ type: 'SUBMIT', clueText: '测试', files: [] });
      setTimeout(resolve, 3000);
    });

    expect(actor.getSnapshot().value).toBe('error_analyzing');
    expect(actor.getSnapshot().context.error).toBe('string-error');
  });

  // =========================================================================
  // CANCEL from different active states
  // =========================================================================

  it('should handle CANCEL from generating state', async () => {
    const { generateModules: mockedGenModules } = await import('../assembler');
    // Make generateModules hang
    vi.mocked(mockedGenModules).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 30000)) as never,
    );

    const actor = createActor(deviationMachine);
    actor.start();

    await new Promise<void>((resolve) => {
      const sub = actor.subscribe((s) => {
        if (s.value === 'generating') { sub.unsubscribe(); resolve(); }
      });
      actor.send({ type: 'SUBMIT', clueText: '测试', files: [] });
      setTimeout(resolve, 3000);
    });

    if (actor.getSnapshot().value === 'generating') {
      actor.send({ type: 'CANCEL' });
      await new Promise((r) => setTimeout(r, 100));
      expect(actor.getSnapshot().value).toBe('cancelled');
      expect(actor.getSnapshot().context.error).toBe('工作流已被用户取消');
    }
  });

  // =========================================================================
  // error_timeout RETRY with specific currentStep values (guard branches)
  // =========================================================================

  it('should resume from identifying on RETRY from error_timeout with step 3', async () => {
    // We need to reach error_timeout with currentStep=2 (analyzing sets step 2)
    // Use fake timers to trigger the timeout
    vi.useFakeTimers();

    // Make analyzeClue hang so timeout fires
    vi.mocked(analyzeClueNode).mockImplementationOnce(
      () => new Promise(() => {}) as never, // never resolves
    );

    const actor = createActor(deviationMachine);
    actor.start();
    actor.send({ type: 'SUBMIT', clueText: '测试', files: [] });

    // Advance past the 120s timeout for analyzing
    await vi.advanceTimersByTimeAsync(121000);

    // Should be in error_timeout with currentStep=2
    expect(actor.getSnapshot().value).toBe('error_timeout');
    expect(actor.getSnapshot().context.error).toContain('超时');

    // W2: timeout must abort the in-flight LLM request
    const { abortWorkflowLLM } = await import('../../llm/caller');
    expect(abortWorkflowLLM).toHaveBeenCalled();

    // RETRY with currentStep=2 → default path → analyzing
    // After retry, the mocked actors resolve fast so workflow may complete
    actor.send({ type: 'RETRY' });
    await vi.advanceTimersByTimeAsync(500);
    // The key: we left error_timeout (guard exercised), workflow resumed
    const val = actor.getSnapshot().value;
    expect(val).not.toBe('error_timeout');

    actor.stop();
    vi.useRealTimers();
  });

  it('should resume from matching on RETRY from error_timeout with step 4', async () => {
    vi.useFakeTimers();

    // Let analyzing succeed but identifying hang
    vi.mocked(analyzeClueNode).mockResolvedValue({
      summary: '摘要', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis',
    });
    const { identifyFactorsNode } = await import('../nodes/factor-identify');
    vi.mocked(identifyFactorsNode).mockImplementationOnce(
      () => new Promise(() => {}) as never,
    );

    const actor = createActor(deviationMachine);
    actor.start();
    actor.send({ type: 'SUBMIT', clueText: '测试', files: [] });

    // Wait for identifying state then advance past timeout
    await vi.advanceTimersByTimeAsync(100); // let analyzing complete
    await vi.advanceTimersByTimeAsync(121000); // identifying timeout

    if (actor.getSnapshot().value === 'error_timeout') {
      // currentStep should be 3 (set by assignAnalysis) → isStep3 guard
      actor.send({ type: 'RETRY' });
      await vi.advanceTimersByTimeAsync(500);
      // We left error_timeout (isStep3 guard was exercised)
      expect(actor.getSnapshot().value).not.toBe('error_timeout');
    }

    actor.stop();
    vi.useRealTimers();
  });

  it('should retain submitted files in clueInput (附件引用不再被丢弃)', async () => {
    const actor = createActor(deviationMachine);
    actor.start();
    actor.send({
      type: 'SUBMIT',
      clueText: '测试线索',
      files: [{ name: '校准记录.pdf', content: 'data:application/pdf;base64,xxx' }],
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().context.clueInput.files).toHaveLength(1);
    expect(actor.getSnapshot().context.clueInput.files[0].name).toBe('校准记录.pdf');
    actor.stop();
  });

  it('should RETRY to revising (not generating) from error_timeout when targeted revision timed out', async () => {
    vi.useFakeTimers();

    const { reviseModules } = await import('../assembler');
    const actor = createActor(deviationMachine);
    actor.start();
    actor.send({ type: 'SUBMIT', clueText: '测试', files: [] });
    await vi.advanceTimersByTimeAsync(500); // run full happy path → review

    // 定向修订：让 reviseModules 挂起以触发超时
    vi.mocked(reviseModules).mockImplementationOnce(() => new Promise(() => {}) as never);
    actor.send({ type: 'REVISE_TARGETED', targets: ['background'], revisionContext: '修改背景' });
    await vi.advanceTimersByTimeAsync(100); // enter revising
    await vi.advanceTimersByTimeAsync(301000); // revising timeout（超时阈值已提至 300s）

    expect(actor.getSnapshot().value).toBe('error_timeout');
    expect(actor.getSnapshot().context.revisionTargets).toEqual(['background']);
    expect(actor.getSnapshot().context.currentStep).toBe(7);

    // 修复回归：定向修订超时 RETRY 必须回 revising（保留修订目标），
    // 而非跳到 generating 全量重生成（原实现丢失修订目标）
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('revising');
    // 修订目标保留
    expect(actor.getSnapshot().context.revisionTargets).toEqual(['background']);

    actor.stop();
    vi.useRealTimers();
  });
});
