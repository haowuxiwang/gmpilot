/**
 * Workflow IPC handlers for Electron main process.
 * Runs XState deviation workflow and streams progress to renderer.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { createActor } from 'xstate';
import { randomUUID } from 'crypto';
import path from 'path';
import { createDeviationMachine } from '../../core/workflow/deviation-machine';
import { initRetriever } from '../../core/rag/index';
import { getDatabase, initSchema } from '../../core/db/connection';
import { createReport } from '../../core/db/schema';
import { createLogger } from '../../core/utils/logger';
import { readFileContent } from '../../core/utils/file-reader';
import type { DeviationReport } from '../../core/workflow/types';

const log = createLogger('Workflow');

// Generate correlation ID for request tracing
function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

// Timeout for workflow execution (5 minutes)
const WORKFLOW_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_CLUE_LENGTH = 10_000;

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

export function registerWorkflowIPC(): void {
  // Mutex lock to prevent concurrent workflow execution
  let isWorkflowRunning = false;

  // Run deviation workflow
  ipcMain.handle('workflow:runDeviation', async (event, clueText: string, files?: { name: string; content?: string }[]) => {
    // Check if workflow is already running
    if (isWorkflowRunning) {
      return { success: false, error: '工作流正在运行中，请等待完成' };
    }

    // Input validation
    if (!clueText || typeof clueText !== 'string' || clueText.trim().length === 0) {
      return { success: false, error: '请输入偏差线索内容' };
    }

    // Process attached files
    let fullClueText = clueText;
    if (files && files.length > 0) {
      const fileContents = await processAttachedFiles(files);
      if (fileContents) {
        fullClueText = `${clueText}\n\n--- 附件内容 ---\n${fileContents}`;
      }
    }

    if (fullClueText.length > MAX_CLUE_LENGTH) {
      return { success: false, error: `输入内容过长（最多 ${MAX_CLUE_LENGTH} 字符）` };
    }

    const correlationId = generateCorrelationId();
    log.info('Workflow started', { correlationId, clueLength: fullClueText.length, fileCount: files?.length || 0 });
    const workflowStartTime = Date.now();

    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      log.error('Window not found');
      return { success: false, error: 'Window not found' };
    }

    // Set workflow as running
    isWorkflowRunning = true;

    try {
      // 优化4: 知识库已在应用启动时预加载，这里只需确保初始化
      const db = getDatabase();
      await initSchema(db);
      await initRetriever(db);
      log.info('RAG ready');

      // Create machine with streaming callback injected via provide()
      const baseMachine = createDeviationMachine();
      const machine = baseMachine.provide({
        actors: {
          // Override generateModules to add streaming callback
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          generateModules: (async ({ input }: { input: import('../../core/workflow/types').WorkflowContext }) => {
            const { generateModules, assembleReport } = await import('../../core/workflow/assembler');
            const { BackgroundGenerator } = await import('../../core/workflow/modules/background');
            const { InvestigationGenerator } = await import('../../core/workflow/modules/investigation');
            const { ConclusionGenerator } = await import('../../core/workflow/modules/conclusion');
            const { RiskAssessmentGenerator } = await import('../../core/workflow/modules/risk-assessment');
            const { CAPAGenerator } = await import('../../core/workflow/modules/capa');
            const { CoverGenerator } = await import('../../core/workflow/modules/cover');
            const { AttachmentsGenerator } = await import('../../core/workflow/modules/attachments');

            const deviationId = `DEV-${randomUUID().slice(0, 8).toUpperCase()}`;

            // Streaming callback — send partial results to renderer
            const onPartial = (partial: Partial<DeviationReport>) => {
              if (!window.isDestroyed()) {
                window.webContents.send('workflow:streaming', { partial });
              }
            };

            // Build module context
            const moduleContext = {
              deviationId,
              analysis: input.analysis!,
              factors: input.factors!,
              regulations: input.regulations,
              findings: input.findings,
              regulationContext: input.regulationContext,
            };

            // Generate modules
            const modules = await generateModules(
              {
                cover: new CoverGenerator(),
                background: new BackgroundGenerator(),
                investigation: new InvestigationGenerator(),
                conclusion: new ConclusionGenerator(),
                riskAssessment: new RiskAssessmentGenerator(),
                capa: new CAPAGenerator(),
                attachments: new AttachmentsGenerator(),
              },
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
              input.findings,
              input.regulations,
              input.findings,
            );

            return report;
          }) as any,
        },
      });
      const actor = createActor(machine);

      // Start the workflow
      actor.start();

      // Send SUBMIT event with full clue text (including file contents)
      actor.send({ type: 'SUBMIT', clueText: fullClueText, files: [] });

      // Wait for workflow to reach review or input (error), with timeout
      return new Promise((resolve) => {
        // Timeout mechanism
        const timeout = setTimeout(() => {
          log.error('Workflow timeout', { clueText: clueText.slice(0, 100) });
          actor.stop();
          resolve({
            success: false,
            error: '工作流执行超时（5分钟），请重试',
          });
        }, WORKFLOW_TIMEOUT_MS);

        // Single subscribe for both progress and completion
        actor.subscribe((snapshot) => {
          const { context, value } = snapshot;

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
              error: context.error,
            });
          }

          // Completion: reached 'review' state
          if (value === 'review') {
            clearTimeout(timeout);
            actor.stop();

            const report = context.report;

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
            resolve({ success: true, report });
          }
          // Error: back to 'input' state with error context
          // Only treat as error if context.error is set (XState onError transitions set this)
          // When user clicks Reset after success, context.error is null — not an error
          else if (value === 'input' && context.error) {
            clearTimeout(timeout);
            actor.stop();

            log.error('Workflow failed', { correlationId, error: context.error });
            resolve({ success: false, error: context.error });
          }
        });
      });
    } catch (error) {
      log.error('Workflow initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      }, error instanceof Error ? error : undefined);
      return { success: false, error: error instanceof Error ? error.message : '工作流初始化失败' };
    } finally {
      // Release the lock
      isWorkflowRunning = false;
    }
  });
}
