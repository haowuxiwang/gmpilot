/**
 * GMPilot deviation generation workflow.
 * XState v5 state machine with modular generation.
 *
 * Flow: input → analyzing → identifying → matching → generating → review → done
 *
 * New modular generation:
 * - Phase 1 (parallel): background, investigation
 * - Phase 2 (sequential): conclusion
 * - Phase 3 (parallel): riskAssessment, capa
 * - Phase 4 (auto): cover, attachments
 * - Final: assemble into complete report
 */

import { setup, assign, fromPromise } from 'xstate';
import type { WorkflowContext } from './types';
import { analyzeClueNode } from './nodes/clue-analysis';
import { identifyFactorsNode } from './nodes/factor-identify';
import { matchRegulationsNode } from './nodes/regulation-match';
import { createLogger } from '../utils/logger';

const log = createLogger('Workflow');
import { getRetriever, isRetrieverAvailable } from '../rag/index';

// Module generators
import { BackgroundGenerator } from './modules/background';
import { InvestigationGenerator } from './modules/investigation';
import { ConclusionGenerator } from './modules/conclusion';
import { RiskAssessmentGenerator } from './modules/risk-assessment';
import { CAPAGenerator } from './modules/capa';
import { CoverGenerator } from './modules/cover';
import { AttachmentsGenerator } from './modules/attachments';
import { generateModules, assembleReport } from './assembler';
import type { ModuleContext } from './modules/base';

/**
 * Type-safe helper to extract output from XState actor done events.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  factors: { man: string[]; machine: string[]; material: string[]; method: string[]; environment: string[] } | null,
): Promise<string> {
  if (!isRetrieverAvailable()) return '';
  try {
    const retriever = getRetriever();
    const factorText = factors
      ? [factors.man, factors.machine, factors.material, factors.method, factors.environment]
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
  // Module generators
  const backgroundGen = new BackgroundGenerator();
  const investigationGen = new InvestigationGenerator();
  const conclusionGen = new ConclusionGenerator();
  const riskAssessmentGen = new RiskAssessmentGenerator();
  const capaGen = new CAPAGenerator();
  const coverGen = new CoverGenerator();
  const attachmentsGen = new AttachmentsGenerator();

  return setup({
    types: {} as {
      context: WorkflowContext;
      events:
        | { type: 'SUBMIT'; clueText: string; files: unknown[] }
        | { type: 'REVISE' }
        | { type: 'EXPORT' }
        | { type: 'RESET' }
        | { type: 'RETRY' };
    },
    actors: {
      analyzeClue: fromPromise(async ({ input }: { input: WorkflowContext }) =>
        analyzeClueNode(input.clueInput.text)),

      identifyFactors: fromPromise(async ({ input }: { input: WorkflowContext }) => {
        if (!input.analysis) {
          throw new Error('Cannot identify factors: analysis is null');
        }
        const summary = input.analysis.summary;

        const [factorsResult, regulationContext] = await Promise.all([
          identifyFactorsNode(summary, input.analysis),
          retrieveRegulationContext(summary, input.factors),
        ]);

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

        const deviationId = `DEV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

        log.info('Starting modular generation', { deviationId });

        // Build module context
        const moduleContext: ModuleContext = {
          deviationId,
          analysis: input.analysis,
          factors: input.factors,
          regulations: input.regulations,
          findings: input.findings,
          regulationContext: input.regulationContext,
        };

        // Generate modules with dependency ordering
        const modules = await generateModules(
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cover: coverGen as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            background: backgroundGen as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            investigation: investigationGen as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            conclusion: conclusionGen as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            riskAssessment: riskAssessmentGen as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            capa: capaGen as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            attachments: attachmentsGen as any,
          },
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
        );

        return report;
      }),
    },
    actions: {
      assignClueInput: assign({
        clueInput: ({ event }) => ({
          text: event.type === 'SUBMIT' ? event.clueText : '',
          files: event.type === 'SUBMIT' ? [] : [],
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
        report: ({ event }) => getActorOutput<WorkflowContext['report']>(event),
        currentStep: 6,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignError: assign({
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
        currentStep: 1,
        error: null,
      }),
      logEnterAnalyzing: () => { log.info('Workflow state: analyzing (step 2/6)'); },
      logEnterIdentifying: () => { log.info('Workflow state: identifying (step 3/6)'); },
      logEnterMatching: () => { log.info('Workflow state: matching (step 4/6)'); },
      logEnterGenerating: () => { log.info('Workflow state: generating (step 5/6)'); },
      logEnterReview: () => { log.info('Workflow state: review (step 6/6)'); },
      logEnterDone: () => { log.info('Workflow state: done'); },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logError: ({ event }: any) => {
        const err = event.error instanceof Error ? event.error : new Error(String(event.error));
        log.error('Workflow step failed', { error: err.message }, err);
      },
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
      currentStep: 1,
      error: null,
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
      },
      generating: {
        entry: 'logEnterGenerating',
        invoke: {
          src: 'generateModules',
          input: ({ context }) => context,
          onDone: {
            target: 'review',
            actions: 'assignReport',
          },
          onError: {
            target: 'error_generating',
            actions: 'assignError',
          },
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
      review: {
        entry: 'logEnterReview',
        on: {
          REVISE: 'generating',
          EXPORT: 'done',
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
