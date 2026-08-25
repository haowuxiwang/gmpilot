/**
 * GMPilot deviation generation workflow.
 * XState v5 state machine with modular generation.
 *
 * Flow: input → analyzing → identifying → matching → generating → review → done
 *
 * New modular generation:
 * - Phase 1 (parallel): background, investigation, cover
 * - Phase 2 (depends on investigation): conclusion, attachments
 * - Phase 3 (depends on conclusion): riskAssessment, capa
 * - Final: assemble into complete report
 */

import { setup, assign, fromPromise } from 'xstate';
import type { WorkflowContext, FileRef } from './types';
import { analyzeClueNode } from './nodes/clue-analysis';
import { identifyFactorsNode } from './nodes/factor-identify';
import { matchRegulationsNode } from './nodes/regulation-match';
import { createLogger } from '../utils/logger';

const log = createLogger('Workflow');
import { getRetriever, isRetrieverAvailable } from '../rag/index';
import { auditDeviationReport, abortWorkflowLLM } from '../llm/caller';
import { extractFactoryDeviationId, generateFallbackDeviationId } from '../utils/deviation-id';
import { reportToMarkdown } from './report-to-markdown';

import { createDefaultGenerators, generateModules, assembleReport, reviseModules, buildModuleContext, type RevisableModule } from './assembler';

/**
 * Type-safe helper to extract output from XState actor done events.
 */
 
function getActorOutput<T>(event: unknown): T {
  if (typeof event === 'object' && event !== null && 'output' in event) {
    return (event as { output: T }).output;
  }
  throw new Error('Invalid actor done event: missing output');
}

/**
 * RAG retrieval helper.
 */
async function retrieveRegulationContext(
  summary: string,
  factors: { man: string[]; machine: string[]; material: string[]; method: string[]; environment: string[]; measurement: string[] } | null,
): Promise<string> {
  if (!isRetrieverAvailable()) return '';
  try {
    const retriever = getRetriever();
    const factorText = factors
      ? [factors.man, factors.machine, factors.material, factors.method, factors.environment, factors.measurement]
          .flat().filter(Boolean).join(' ')
      : '';
    const query = `${summary} ${factorText}`;
    return await retriever.getRegulationContext(query);
  } catch (error) {
    log.warn('RAG retrieval failed, using empty context', { error: String(error) });
    return '';
  }
}

/**
 * Create the deviation workflow machine with modular generation.
 */
export function createDeviationMachine() {
  // Module generators（单一生源：与 workflow IPC 共用 assembler 工厂）
  const gens = createDefaultGenerators();
  const backgroundGen = gens.background;
  const investigationGen = gens.investigation;
  const conclusionGen = gens.conclusion;
  const riskAssessmentGen = gens.riskAssessment;
  const capaGen = gens.capa;

  return setup({
    types: {} as {
      context: WorkflowContext;
      events:
        | { type: 'SUBMIT'; clueText: string; files: FileRef[] }
        | { type: 'REVISE'; revisionContext?: string }
        | { type: 'REVISE_TARGETED'; targets: string[]; revisionContext: string }
        | { type: 'EXPORT' }
        | { type: 'RESET' }
        | { type: 'RETRY' }
        | { type: 'CANCEL' };
    },
    actors: {
      analyzeClue: fromPromise(async ({ input }: { input: WorkflowContext }) =>
        analyzeClueNode(input.clueInput.text)),

      identifyFactors: fromPromise(async ({ input }: { input: WorkflowContext }) => {
        if (!input.analysis) {
          throw new Error('Cannot identify factors: analysis is null');
        }
        // 传线索全文（而非摘要）给因素识别——设备编号/时间/地点等原始细节决定因素判断质量
        const clueText = input.clueInput?.text?.trim() || input.analysis.summary;

        // 串行执行：先识别因素，再以「摘要 + 已识别因素」检索法规上下文。
        // 修复原并行实现中 input.factors 恒为 null、RAG 检索退化为纯摘要查询的问题
        const factorsResult = await identifyFactorsNode(clueText, input.analysis);
        const regulationContext = await retrieveRegulationContext(
          input.analysis.summary,
          factorsResult.factors,
        );

        return {
          factors: factorsResult.factors,
          findings: factorsResult.findings,
          regulationContext,
        };
      }),

      matchRegulations: fromPromise(async ({ input }: { input: WorkflowContext }) => {
        if (!input.analysis) {
          throw new Error('Cannot match regulations: analysis is null');
        }
        if (!input.factors) {
          throw new Error('Cannot match regulations: factors is null');
        }
        return matchRegulationsNode(
          input.analysis.summary,
          input.factors,
          input.regulationContext,
        );
      }),

      /**
       * Modular report generation.
       * Generates each section independently, then assembles.
       */
      generateModules: fromPromise(async ({ input }: { input: WorkflowContext }) => {
        if (!input.analysis || !input.factors) {
          throw new Error('Cannot generate modules: analysis or factors missing');
        }

        // 优先使用线索中的工厂内部偏差编号（如 D-TZ-API-EG-26003），否则生成默认编号
        const deviationId =
          extractFactoryDeviationId(input.clueInput?.text) ?? generateFallbackDeviationId();

        log.info('Starting modular generation', { deviationId });

        // Build module context (单一生源，避免多实现漂移)
        const moduleContext = buildModuleContext({ ...input, clueText: input.clueInput.text }, deviationId);

        // Generate modules with dependency ordering
        const modules = await generateModules(
          gens,
          moduleContext,
          (phase, module) => {
            log.info(`Module generation: ${phase}`, { module });
          },
        );

        // Assemble into complete report
        const report = assembleReport(
          deviationId,
          modules,
          input.factors,
          input.regulations,
          input.findings,
          input.analysis?.documentType ?? 'deviation_analysis',
        );

        return { report, fallbackModules: modules.fallbackModules || [] };
      }),

      /**
       * Built-in Audit Agent.
       * Audits the generated report against SOP/regulation context.
       */
      auditReport: fromPromise(async ({ input }: { input: WorkflowContext }) => {
        if (!input.report) {
          throw new Error('Cannot audit: report is null');
        }

        log.info('Starting built-in audit', { deviationId: input.report.deviationId });

        // Convert report to markdown
        const markdown = reportToMarkdown(input.report);

        // Get audit context from RAG (SOP + regulations)
        let auditContext = '（无可用SOP/法规参考）';
        if (isRetrieverAvailable() && input.analysis) {
          try {
            const retriever = getRetriever();
            auditContext = await retriever.getAuditContext(input.analysis.summary);
          } catch (error) {
            log.warn('Failed to get audit context from RAG', { error: String(error) });
          }
        }

        // Run LLM audit
        const result = await auditDeviationReport(markdown, auditContext);
        return result;
      }),

      /**
       * P3: Targeted module revision.
       * Only regenerates specific modules based on audit findings.
       */
      reviseTargetModules: fromPromise(async ({ input }: { input: WorkflowContext }) => {
        if (!input.report) {
          throw new Error('Cannot revise: report is null');
        }

        const targets = (input.revisionTargets || []) as RevisableModule[];
        if (targets.length === 0) {
          throw new Error('No revision targets specified');
        }
        if (!input.analysis || !input.factors) {
          throw new Error('Cannot revise: analysis or factors is null');
        }

        log.info('Targeted revision starting', {
          deviationId: input.report.deviationId,
          targets,
          revision: input.revisionCount,
        });

        // Extract existing module data from report
        const existingModules = {
          cover: input.report.cover,
          background: { ...input.report.background, photos: input.report.background.photos || [] },
          investigation: input.report.investigation,
          conclusion: input.report.conclusion,
          riskAssessment: input.report.riskAssessment,
          capa: input.report.capa,
          attachments: { attachments: input.report.attachments, versionHistory: input.report.versionHistory },
        };

        const context = {
          deviationId: input.report.deviationId,
          analysis: input.analysis,
          factors: input.factors,
          regulations: input.regulations,
          findings: input.findings,
          regulationContext: input.regulationContext,
          revisionContext: input.revisionContext,
        };

        // Run targeted revision
        const revisedModules = await reviseModules(
          {
            background: backgroundGen,
            investigation: investigationGen,
            conclusion: conclusionGen,
            riskAssessment: riskAssessmentGen,
            capa: capaGen,
          },
          existingModules,
          targets,
          context,
        );

        // Re-assemble report with revised modules
        const revisedReport = assembleReport(
          input.report.deviationId,
          revisedModules,
          input.factors,
          input.regulations,
          input.findings,
          input.analysis?.documentType ?? 'deviation_analysis',
        );

        return { report: revisedReport, fallbackModules: revisedModules.fallbackModules || [] };
      }),
    },
    actions: {
      assignClueInput: assign({
        clueInput: ({ event }) => ({
          text: event.type === 'SUBMIT' ? event.clueText : '',
          // 附件内容由 IPC 层（electron/ipc/workflow.ts processAttachedFiles）读取后并入 clueText，
          // 此处保留文件引用供审计/调试（渲染端传 content，非 path）
          files: event.type === 'SUBMIT' ? (event.files ?? []) : [],
        }),
        currentStep: 2,
        error: null,
      }),
      assignAnalysis: assign({
        analysis: ({ event }) => getActorOutput<WorkflowContext['analysis']>(event),
        currentStep: 3,
      }),
      assignFactors: assign({
        factors: ({ event }) => {
          const output = getActorOutput<{ factors: WorkflowContext['factors']; findings: WorkflowContext['findings']; regulationContext: string }>(event);
          return output.factors;
        },
        findings: ({ event }) => {
          const output = getActorOutput<{ factors: WorkflowContext['factors']; findings: WorkflowContext['findings']; regulationContext: string }>(event);
          return output.findings;
        },
        regulationContext: ({ event }) => {
          const output = getActorOutput<{ regulationContext: string }>(event);
          return output.regulationContext;
        },
        currentStep: 4,
      }),
      assignRegulations: assign({
        regulations: ({ event }) => getActorOutput<WorkflowContext['regulations']>(event),
        currentStep: 5,
      }),
      assignReport: assign({
        report: ({ event }) => {
          const output = getActorOutput<{ report: WorkflowContext['report']; fallbackModules?: string[] }>(event);
          return output.report;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fallbackModules: ({ event }: any) => {
          const output = getActorOutput<{ report: unknown; fallbackModules?: string[] }>(event);
          return output.fallbackModules || [];
        },
        currentStep: 6,
      }),
      assignAuditFindings: assign({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        auditFindings: ({ event }: any) => {
          const output = getActorOutput<{ findings: WorkflowContext['auditFindings']; overallScore: number; summary: string }>(event);
          return output.findings;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        auditScore: ({ event }: any) => {
          const output = getActorOutput<{ findings: unknown; overallScore: number; summary: string }>(event);
          return output.overallScore;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        auditSummary: ({ event }: any) => {
          const output = getActorOutput<{ findings: unknown; overallScore: number; summary: string }>(event);
          return output.summary;
        },
        currentStep: 7,
      }),
       
      assignError: assign({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: ({ event }: any) => {
          const error = event.error instanceof Error ? event.error : new Error(String(event.error));
          return error.message;
        },
      }),
      resetWorkflow: assign({
        clueInput: { text: '', files: [] },
        analysis: null,
        factors: null,
        regulationContext: '',
        regulations: [],
        findings: [],
        report: null,
        auditFindings: null,
        auditScore: null,
        auditSummary: null,
      currentStep: 1,
      error: null,
      revisionCount: 0,
      revisionTargets: [],
      revisionContext: '',
      fallbackModules: [],
    }),
      incrementRevision: assign({
        revisionCount: ({ context }) => context.revisionCount + 1,
      }),
      assignRevisionTargets: assign({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        revisionTargets: ({ event }: any) => event.targets || [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        revisionContext: ({ event }: any) => event.revisionContext || '',
      }),
      assignCancelled: assign({
        error: '工作流已被用户取消',
      }),
      assignTimeout: assign({
        error: '工作流步骤执行超时，请重试',
      }),
      logEnterCancelled: () => { log.info('Workflow cancelled by user'); },
      logEnterTimeout: () => {
        log.error('Workflow step timed out');
        // W2: abort in-flight LLM request so it doesn't keep consuming resources
        // after the machine has already transitioned to error_timeout.
        // callLLMWithRetry's AbortError path throws '工作流已取消' (no retry).
        abortWorkflowLLM();
      },
      logEnterRevising: () => { log.info('Workflow state: revising (targeted module revision)'); },
      logEnterAnalyzing: () => { log.info('Workflow state: analyzing (step 2/6)'); },
      logEnterIdentifying: () => { log.info('Workflow state: identifying (step 3/6)'); },
      logEnterMatching: () => { log.info('Workflow state: matching (step 4/6)'); },
      logEnterGenerating: () => { log.info('Workflow state: generating (step 5/7)'); },
      logEnterAuditing: () => { log.info('Workflow state: auditing (step 6/7)'); },
      logEnterReview: () => { log.info('Workflow state: review (step 7/7)'); },
      logEnterDone: () => { log.info('Workflow state: done'); },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logError: ({ event }: any) => {
        const err = event.error instanceof Error ? event.error : new Error(String(event.error));
        log.error('Workflow step failed', { error: err.message }, err);
      },
    },
    guards: {
      isStep3: ({ context }) => context.currentStep === 3,
      isStep4: ({ context }) => context.currentStep === 4,
      isStep5: ({ context }) => context.currentStep === 5,
      isStep6: ({ context }) => context.currentStep === 6,
      isStep7: ({ context }) => context.currentStep === 7,
      // 定向修订是否进行中（revisionTargets 非空）——用于区分「revising 超时」与「全量生成超时」
      hasRevisionTargets: ({ context }) => (context.revisionTargets?.length ?? 0) > 0,
      canRevise: ({ context }) => context.revisionCount < 3,
    },
  }).createMachine({
    id: 'deviation',
    initial: 'input',
    context: {
      clueInput: { text: '', files: [] },
      analysis: null,
      factors: null,
      regulationContext: '',
      regulations: [],
      findings: [],
      report: null,
      auditFindings: null,
      auditScore: null,
      auditSummary: null,
      currentStep: 1,
      error: null,
      revisionCount: 0,
      revisionTargets: [],
      revisionContext: '',
      fallbackModules: [],
    },
    states: {
      input: {
        on: {
          SUBMIT: {
            target: 'analyzing',
            actions: 'assignClueInput',
          },
        },
      },
      analyzing: {
        entry: 'logEnterAnalyzing',
        invoke: {
          src: 'analyzeClue',
          input: ({ context }) => context,
          onDone: {
            target: 'identifying',
            actions: 'assignAnalysis',
          },
          onError: {
            target: 'error_analyzing',
            actions: 'assignError',
          },
        },
        after: {
          120000: { target: 'error_timeout', actions: 'assignTimeout' },
        },
        on: {
          CANCEL: { target: 'cancelled', actions: 'assignCancelled' },
        },
      },
      identifying: {
        entry: 'logEnterIdentifying',
        invoke: {
          src: 'identifyFactors',
          input: ({ context }) => context,
          onDone: {
            target: 'matching',
            actions: 'assignFactors',
          },
          onError: {
            target: 'error_identifying',
            actions: 'assignError',
          },
        },
        after: {
          120000: { target: 'error_timeout', actions: 'assignTimeout' },
        },
        on: {
          CANCEL: { target: 'cancelled', actions: 'assignCancelled' },
        },
      },
      matching: {
        entry: 'logEnterMatching',
        invoke: {
          src: 'matchRegulations',
          input: ({ context }) => context,
          onDone: {
            target: 'generating',
            actions: 'assignRegulations',
          },
          onError: {
            target: 'error_matching',
            actions: 'assignError',
          },
        },
        after: {
          120000: { target: 'error_timeout', actions: 'assignTimeout' },
        },
        on: {
          CANCEL: { target: 'cancelled', actions: 'assignCancelled' },
        },
      },
      generating: {
        entry: 'logEnterGenerating',
        invoke: {
          src: 'generateModules',
          input: ({ context }) => context,
          onDone: {
            target: 'auditing',
            actions: 'assignReport',
          },
          onError: {
            target: 'error_generating',
            actions: 'assignError',
          },
        },
        after: {
          180000: { target: 'error_timeout', actions: 'assignTimeout' },
        },
        on: {
          CANCEL: { target: 'cancelled', actions: 'assignCancelled' },
        },
      },
      auditing: {
        entry: 'logEnterAuditing',
        invoke: {
          src: 'auditReport',
          input: ({ context }) => context,
          onDone: {
            target: 'review',
            actions: 'assignAuditFindings',
          },
          onError: {
            target: 'error_auditing',
            actions: 'assignError',
          },
        },
        after: {
          180000: { target: 'error_timeout', actions: 'assignTimeout' },
        },
        on: {
          CANCEL: { target: 'cancelled', actions: 'assignCancelled' },
        },
      },
      error_analyzing: {
        entry: 'logError',
        on: {
          RETRY: 'analyzing',
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      error_identifying: {
        entry: 'logError',
        on: {
          RETRY: 'identifying',
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      error_matching: {
        entry: 'logError',
        on: {
          RETRY: 'matching',
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      error_generating: {
        entry: 'logError',
        on: {
          RETRY: 'generating',
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      error_auditing: {
        entry: 'logError',
        on: {
          RETRY: 'auditing',
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      review: {
        entry: 'logEnterReview',
        on: {
          REVISE: [
            {
              target: 'generating',
              guard: 'canRevise',
              actions: ['incrementRevision', 'assignRevisionTargets'],
            },
            // If max revisions reached, stay in review
          ],
          REVISE_TARGETED: [
            {
              target: 'revising',
              guard: 'canRevise',
              actions: ['incrementRevision', 'assignRevisionTargets'],
            },
          ],
          EXPORT: 'done',
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      revising: {
        entry: 'logEnterRevising',
        invoke: {
          src: 'reviseTargetModules',
          input: ({ context }) => context,
          onDone: {
            target: 'auditing',
            actions: 'assignReport',
          },
          onError: {
            target: 'error_revising',
            actions: 'assignError',
          },
        },
        after: {
          120000: { target: 'error_timeout', actions: 'assignTimeout' },
        },
        on: {
          CANCEL: {
            target: 'cancelled',
            actions: 'assignCancelled',
          },
        },
      },
      error_revising: {
        entry: 'logError',
        on: {
          RETRY: 'revising',
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      cancelled: {
        entry: 'logEnterCancelled',
        on: {
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      error_timeout: {
        entry: 'logEnterTimeout',
        on: {
          RETRY: [
            // Resume from the step that actually timed out (based on currentStep)
            { target: 'identifying', guard: 'isStep3' },
            { target: 'matching', guard: 'isStep4' },
            { target: 'generating', guard: 'isStep5' },
            { target: 'auditing', guard: 'isStep6' },
            // currentStep=7: 区分两种超时——
            // 1) 定向修订（revising）超时：revisionTargets 非空 → 回到 revising 继续定向修订（保留修订目标），
            //    而不是跳到 generating 全量重生成（原实现会丢失修订目标）
            { target: 'revising', guard: 'hasRevisionTargets' },
            // 2) 全量 REVISE 重生成或 initial 生成超时（无修订目标）→ 回到 generating 重新生成
            { target: 'generating', guard: 'isStep7' },
            // Default: restart from analyzing
            { target: 'analyzing' },
          ],
          RESET: {
            target: 'input',
            actions: 'resetWorkflow',
          },
        },
      },
      done: {
        entry: 'logEnterDone',
        type: 'final',
      },
    },
  });
}

/**
 * Default machine instance (backward compatible).
 */
export const deviationMachine = createDeviationMachine();
