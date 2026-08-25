/**
 * Workflow IPC handlers for Electron main process.
 * Runs XState deviation workflow and streams progress to renderer.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { createActor, fromPromise, type Actor } from 'xstate';
import { randomUUID } from 'crypto';
import path from 'path';
import { createDeviationMachine } from '../../core/workflow/deviation-machine';
import { initRetriever } from '../../core/rag/index';
import { getDatabase, initSchema } from '../../core/db/connection';
import { createReport, saveCheckpoint, deleteCheckpoint } from '../../core/db/schema';
import { createLogger } from '../../core/utils/logger';
import { readFileContent } from '../../core/utils/file-reader';
import { extractFactoryDeviationId } from '../../core/utils/deviation-id';
import { resetWorkflowAbort, abortWorkflowLLM } from '../../core/llm/caller';
import { loadBuiltinKnowledge } from './knowledge';
import { notifyReportComplete } from './notification';

const log = createLogger('Workflow');

// Generate correlation ID for request tracing
function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

// Timeout for workflow execution (10 minutes — accounts for 7 LLM module calls + audit)
const WORKFLOW_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CLUE_LENGTH = 10_000;

// Cache of the most recent successful workflow context.
// Used to backfill targeted revision so revised modules keep full LLM context
// instead of falling back to templates (which would overwrite good content).
let lastWorkflowContext: {
  analysis: unknown;
  factors: unknown;
  regulations: unknown[];
  findings: unknown[];
  regulationContext?: string;
  keyEvents?: string[];
  clueText?: string;
} | null = null;

/**
 * Process a single file and extract its content.
 */
async function processSingleFile(file: { name: string; content?: string }): Promise<string> {
  try {
    // If content is already provided (base64 data URL), skip
    if (file.content && file.content.startsWith('data:')) {
      // For images, just note the file name
      if (file.content.startsWith('data:image/')) {
        return `[图片: ${file.name}]`;
      }
      // For other base64 content, try to decode
      try {
        const base64Data = file.content.split(',')[1];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          const ext = path.extname(file.name).toLowerCase();
          // Use secure temp file approach
          const os = await import('os');
          const crypto = await import('crypto');
          const tempDir = os.tmpdir();
          const tempPath = path.join(tempDir, `gmpilot-${crypto.randomUUID()}${ext}`);
          const fsPromises = await import('fs/promises');
          await fsPromises.writeFile(tempPath, buffer);
          try {
            const text = await readFileContent(tempPath, ext);
            return `[文件: ${file.name}]\n${text}`;
          } finally {
            await fsPromises.unlink(tempPath).catch(() => {});
          }
        }
      } catch (decodeError) {
        log.warn('Failed to decode base64 content', { fileName: file.name, error: String(decodeError) });
        return `[文件: ${file.name} - 内容解析失败]`;
      }
    }
    return '';
  } catch (error) {
    log.warn('Failed to process file', { fileName: file.name, error: String(error) });
    return `[文件: ${file.name} - 处理失败]`;
  }
}

/**
 * Process attached files and extract their content (parallel processing).
 */
async function processAttachedFiles(files: { name: string; content?: string }[]): Promise<string> {
  if (!files || files.length === 0) return '';

  // Process all files in parallel
  const results = await Promise.all(files.map(processSingleFile));

  // Filter out empty results and join
  return results.filter(Boolean).join('\n\n');
}

// Shared workflow state for graceful shutdown
let isWorkflowRunning = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeActor: Actor<any> | null = null;

/** Check if a workflow is currently executing (used by main.ts for quit protection) */
export function getWorkflowRunning(): boolean {
  return isWorkflowRunning;
}

export function registerWorkflowIPC(): void {

  // Cancel running workflow
  ipcMain.handle('workflow:cancel', async () => {
    if (!isWorkflowRunning) {
      return { success: false, error: '没有正在运行的工作流' };
    }
    log.info('Workflow cancellation requested');
    // Abort in-flight LLM HTTP requests immediately (works for both full workflow and reviseTargeted)
    abortWorkflowLLM();
    if (activeActor) {
      activeActor.send({ type: 'CANCEL' });
    }
    return { success: true };
  });

  // Run deviation workflow
  ipcMain.handle('workflow:runDeviation', async (event, clueText: string, files?: { name: string; content?: string }[]) => {
    // Check if workflow is already running
    if (isWorkflowRunning) {
      return { success: false, error: '工作流正在运行中，请等待完成' };
    }

    // Input validation (synchronous — before acquiring lock)
    if (!clueText || typeof clueText !== 'string' || clueText.trim().length === 0) {
      log.warn('Workflow rejected: empty clue text', {
        clueType: typeof clueText,
        clueEmpty: clueText === '',
      });
      return { success: false, error: '请输入偏差线索内容' };
    }

    // Acquire lock IMMEDIATELY to prevent TOCTOU race condition.
    // Any async work (file processing, DB init) happens under lock protection.
    isWorkflowRunning = true;

    // Process attached files (async, but protected by lock)
    let fullClueText = clueText;
    if (files && files.length > 0) {
      // Validate total file size to prevent OOM (base64 expands ~37%)
      const MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1.37; // ~10MB raw
      const totalSize = files.reduce((sum, f) => sum + (f.content?.length || 0), 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        isWorkflowRunning = false;
        log.warn('Workflow rejected: attached files too large', {
          totalSize,
          maxSize: MAX_TOTAL_SIZE,
        });
        return { success: false, error: '附件总大小超过 10MB 限制' };
      }
      const fileContents = await processAttachedFiles(files);
      if (fileContents) {
        fullClueText = `${clueText}\n\n--- 附件内容 ---\n${fileContents}`;
      }
    }

    if (fullClueText.length > MAX_CLUE_LENGTH) {
      isWorkflowRunning = false;
      log.warn('Workflow rejected: clue text too long', {
        clueLength: fullClueText.length,
        maxClueLength: MAX_CLUE_LENGTH,
      });
      return { success: false, error: `输入内容过长（最多 ${MAX_CLUE_LENGTH} 字符）` };
    }

    const correlationId = generateCorrelationId();
    log.info('Workflow started', { correlationId, clueLength: fullClueText.length, fileCount: files?.length || 0 });
    const workflowStartTime = Date.now();

    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      isWorkflowRunning = false;
      log.error('Window not found');
      return { success: false, error: 'Window not found' };
    }

    try {
      // Reset abort controller for new workflow run
      resetWorkflowAbort();

      // 优化4: 知识库已在应用启动时预加载，这里只需确保初始化
      const db = getDatabase();
      await initSchema(db);
      await initRetriever(db);

      // P1-5: Retry builtin knowledge loading if startup preload failed.
      // 不阻塞工作流：内置知识库在应用启动时已开始后台索引（worker 线程），
      // 全量索引需要数分钟，这里不能等待完成——RAG 不可用时流程有降级路径。
      try {
        void loadBuiltinKnowledge().catch(() => {});
      } catch (kbError) {
        log.warn('Builtin knowledge retry failed (non-fatal)', { error: String(kbError) });
      }
      log.info('RAG ready');

      // Create machine with streaming callback injected via provide()
      const baseMachine = createDeviationMachine();
      const machine = baseMachine.provide({
        actors: {
          // Override generateModules to add streaming progress → renderer.
          // 复用 assembler 的 createDefaultGenerators 单一工厂，避免双实现漂移。
          generateModules: fromPromise(async ({ input }: { input: import('../../core/workflow/types').WorkflowContext }) => {
            const { createDefaultGenerators, generateModules, assembleReport, buildModuleContext } =
              await import('../../core/workflow/assembler');

            if (!input.analysis || !input.factors) {
              throw new Error('Cannot generate modules: analysis or factors missing');
            }

            // 优先使用线索中的工厂内部偏差编号，否则生成默认编号
            const deviationId =
              extractFactoryDeviationId(input.clueInput?.text) ?? `DEV-${randomUUID().slice(0, 8).toUpperCase()}`;

            // Build module context (单一生源)
            const moduleContext = buildModuleContext({ ...input, clueText: input.clueInput?.text ?? '' }, deviationId);

            // Generate modules
            const modules = await generateModules(
              createDefaultGenerators(),
              moduleContext,
              (phase, module) => {
                log.info(`Module generation: ${phase}`, { module });
                // Send progress to renderer
                if (!window.isDestroyed()) {
                  window.webContents.send('workflow:streaming', {
                    partial: { deviationId, title: `正在生成 ${module}...` },
                  });
                }
              },
            );

            // Assemble report
            const report = assembleReport(
              deviationId,
              modules,
              input.factors,
              input.regulations,
              input.findings,
              input.analysis?.documentType ?? 'deviation_analysis',
            );

            // 透传 fallbackModules（渲染端提示哪些章节用了模板兜底）
            return { report, fallbackModules: modules.fallbackModules || [] };
          }),
        },
      });
      const actor = createActor(machine);
      activeActor = actor;

      // Start the workflow
      actor.start();

      // Send SUBMIT event with full clue text (including file contents)
      actor.send({ type: 'SUBMIT', clueText: fullClueText, files: [] });

      // Wait for workflow to reach review or input (error), with timeout
      return new Promise((resolve) => {
        let settled = false;
        const settle = (result: { success: boolean; report?: unknown; auditFindings?: unknown[]; auditScore?: number; auditSummary?: string; fallbackModules?: string[]; error?: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          actor.stop();
          activeActor = null;
          isWorkflowRunning = false; // Release mutex only after workflow completes
          resolve(result);
        };

        // Timeout mechanism
        const timeout = setTimeout(() => {
          log.error('Workflow timeout', { clueText: clueText.slice(0, 100) });
          settle({ success: false, error: '工作流执行超时（10分钟），请重试' });
        }, WORKFLOW_TIMEOUT_MS);

        // Single subscribe for both progress and completion
        actor.subscribe((snapshot) => {
          try {
            const { context, value } = snapshot;
            const stepStr = String(value);

            // Save checkpoint at each intermediate step for crash recovery
            if (['identifying', 'matching', 'generating', 'auditing'].includes(stepStr)) {
              const db = getDatabase();
              saveCheckpoint(db, correlationId, stepStr, {
                analysis: context.analysis,
                factors: context.factors,
                regulations: context.regulations,
                findings: context.findings,
                regulationContext: context.regulationContext,
              });
            }

            // Send progress to renderer (if window still exists)
            if (!window.isDestroyed()) {
              window.webContents.send('workflow:progress', {
                step: value,
                currentStep: context.currentStep,
                analysis: context.analysis,
                factors: context.factors,
                regulations: context.regulations,
                findings: context.findings,
                report: context.report,
                auditFindings: context.auditFindings,
                auditScore: context.auditScore,
                auditSummary: context.auditSummary,
                error: context.error,
              });
            }

            // Completion: reached 'review' state
            if (value === 'review') {
              const report = context.report;

              // Cache full context for later targeted revision
              lastWorkflowContext = {
                analysis: context.analysis,
                factors: context.factors,
                regulations: context.regulations,
                findings: context.findings,
                regulationContext: context.regulationContext,
                keyEvents: context.analysis?.keyEvents ?? [],
                clueText: context.clueInput?.text ?? '',
              };

              // Save report to database
              if (report) {
                try {
                  const db = getDatabase();
                  createReport(db, {
                    title: report.title,
                    deviation_id: report.deviationId,
                    deviation_type: 'deviation_analysis',
                    content: JSON.stringify(report),
                    clue_input: context.clueInput.text,
                    factors_json: JSON.stringify(context.factors),
                    regulations_json: JSON.stringify(context.regulations),
                    findings_json: JSON.stringify(context.findings),
                    risk_score: report.riskScore,
                    risk_level: report.riskLevel,
                    report_metadata_json: report.report_metadata ? JSON.stringify(report.report_metadata) : undefined,
                  });
                  log.info('Report saved to database', { deviationId: report.deviationId });
                } catch (saveError) {
                  log.warn('Failed to save report to DB', {
                    error: saveError instanceof Error ? saveError.message : String(saveError),
                  });
                }
              }

              log.info('Workflow completed', {
                correlationId,
                deviationId: report?.deviationId,
                riskScore: report?.riskScore,
                totalDuration: `${Date.now() - workflowStartTime}ms`,
              });
              // Clean up checkpoint on success
              deleteCheckpoint(getDatabase(), correlationId);

              // Fire-and-forget: notify via Feishu (non-blocking)
              if (report) {
                notifyReportComplete({
                  deviationId: report.deviationId,
                  title: report.title,
                  riskLevel: report.riskLevel,
                  riskScore: report.riskScore,
                  summary: report.conclusion?.rootCause || undefined,
                });
              }

              settle({ success: true, report, auditFindings: context.auditFindings, auditScore: context.auditScore, auditSummary: context.auditSummary, fallbackModules: context.fallbackModules });
            }
            // Error: XState error states (error_analyzing, error_identifying, etc.)
            else if (String(value).startsWith('error_')) {
              log.error('Workflow failed', { correlationId, state: String(value), error: context.error });
              settle({ success: false, error: context.error || '工作流执行失败' });
            }
            // Cancelled state
            else if (value === 'cancelled') {
              log.info('Workflow cancelled', { correlationId });
              settle({ success: false, error: '工作流已被用户取消' });
            }
            // Error: back to 'input' state with error context
            else if (value === 'input' && context.error) {
              log.error('Workflow failed', { correlationId, error: context.error });
              settle({ success: false, error: context.error });
            }
          } catch (subscribeError) {
            log.error('Workflow subscribe callback error', {
              correlationId,
              error: subscribeError instanceof Error ? subscribeError.message : String(subscribeError),
            });
            settle({ success: false, error: '工作流内部错误，请重试' });
          }
        });
      });
    } catch (error) {
      activeActor = null;
      isWorkflowRunning = false; // Release mutex on initialization failure
      log.error('Workflow initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      }, error instanceof Error ? error : undefined);
      return { success: false, error: error instanceof Error ? error.message : '工作流初始化失败' };
    }
  });

  // P3: Targeted module revision — revise only specific modules based on audit findings
  ipcMain.handle('workflow:reviseTargeted', async (_event, params: {
    report: import('../../core/workflow/types').DeviationReport;
    targets: string[];
    revisionContext: string;
    analysis?: unknown;
    factors?: unknown;
    regulations?: unknown[];
    findings?: unknown[];
  }) => {
    if (isWorkflowRunning) {
      return { success: false, error: '工作流正在运行中，请等待完成' };
    }

    const { report, targets, revisionContext } = params;
    if (!report || !targets || targets.length === 0) {
      return { success: false, error: '缺少修订参数' };
    }

    log.info('Targeted revision requested', {
      deviationId: report.deviationId,
      targets,
    });

    isWorkflowRunning = true;
    resetWorkflowAbort();

    try {
      const { reviseModules, assembleReport } = await import('../../core/workflow/assembler');
      type RevisableModule = 'background' | 'investigation' | 'conclusion' | 'riskAssessment' | 'capa';
      const { BackgroundGenerator } = await import('../../core/workflow/modules/background');
      const { InvestigationGenerator } = await import('../../core/workflow/modules/investigation');
      const { ConclusionGenerator } = await import('../../core/workflow/modules/conclusion');
      const { RiskAssessmentGenerator } = await import('../../core/workflow/modules/risk-assessment');
      const { CAPAGenerator } = await import('../../core/workflow/modules/capa');

      const existingModules = {
        cover: report.cover ?? {} as typeof report.cover,
        background: report.background ?? {} as typeof report.background,
        investigation: report.investigation ?? {} as typeof report.investigation,
        conclusion: report.conclusion ?? {} as typeof report.conclusion,
        riskAssessment: report.riskAssessment ?? {} as typeof report.riskAssessment,
        capa: report.capa ?? {} as typeof report.capa,
        attachments: { attachments: report.attachments ?? [], versionHistory: report.versionHistory ?? [] },
      };

      // Backfill full LLM context: params (renderer) → last workflow cache → report fields.
      // Without this, generators receive null analysis/factors and silently fall back
      // to templates, overwriting previously generated content (P0-1).
      const backfilledAnalysis = params.analysis ?? lastWorkflowContext?.analysis ?? null;
      const backfilledFactors = params.factors ?? lastWorkflowContext?.factors ?? report.factors ?? null;
      const backfilledRegulations = params.regulations ?? lastWorkflowContext?.regulations ?? report.regulations ?? [];
      const backfilledFindings = params.findings ?? lastWorkflowContext?.findings ?? report.findings ?? [];

      const context = {
        deviationId: report.deviationId,
        analysis: backfilledAnalysis,
        factors: backfilledFactors,
        regulations: backfilledRegulations,
        findings: backfilledFindings,
        regulationContext: lastWorkflowContext?.regulationContext || '',
        keyEvents: lastWorkflowContext?.keyEvents ?? [],
        clueText: lastWorkflowContext?.clueText ?? '',
        revisionContext,
      };

      const revisedModules = await reviseModules(
        {
          background: new BackgroundGenerator(),
          investigation: new InvestigationGenerator(),
          conclusion: new ConclusionGenerator(),
          riskAssessment: new RiskAssessmentGenerator(),
          capa: new CAPAGenerator(),
        },
        existingModules,
        targets as RevisableModule[],
        context,
      );

      const revisedReport = assembleReport(
        report.deviationId,
        revisedModules,
        backfilledFactors,
        backfilledRegulations,
        backfilledFindings,
        (backfilledAnalysis as { documentType?: string } | null)?.documentType === 'deviation_analysis'
          ? 'deviation_analysis'
          : undefined,
      );

      // 修订后重新审计（对齐主流程 auditing 步骤），保证前端「已重新审核」声明成立
      let auditFindings: unknown[] = [];
      let auditScore = 0;
      let auditSummary = '';
      try {
        const { reportToMarkdown } = await import('../../core/workflow/report-to-markdown');
        const { auditDeviationReport } = await import('../../core/llm/caller');
        const { getRetriever, isRetrieverAvailable } = await import('../../core/rag/index');
        const markdown = reportToMarkdown(revisedReport);
        let auditContext = '（无可用SOP/法规参考）';
        if (isRetrieverAvailable()) {
          try {
            const retriever = getRetriever();
            const summary = (backfilledAnalysis as { summary?: string } | null)?.summary || '';
            if (summary) auditContext = await retriever.getAuditContext(summary);
          } catch (ragError) {
            log.warn('Revision audit RAG context failed (non-fatal)', { error: String(ragError) });
          }
        }
        const audit = await auditDeviationReport(markdown, auditContext);
        auditFindings = audit.findings ?? [];
        auditScore = audit.overallScore ?? 0;
        auditSummary = audit.summary ?? '';
        log.info('Revision audit completed', {
          deviationId: report.deviationId,
          score: auditScore,
          findings: auditFindings.length,
        });
      } catch (auditError) {
        log.warn('Revision audit failed (non-fatal)', { error: String(auditError) });
      }

      log.info('Targeted revision complete', { deviationId: report.deviationId });
      return {
        success: true,
        report: revisedReport,
        fallbackModules: revisedModules.fallbackModules || [],
        auditFindings,
        auditScore,
        auditSummary,
      };
    } catch (error) {
      log.error('Targeted revision failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : '定向修订失败' };
    } finally {
      isWorkflowRunning = false;
    }
  });
}
