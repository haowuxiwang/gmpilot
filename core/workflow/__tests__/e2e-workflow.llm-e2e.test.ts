/**
 * E2E workflow test with real LLM calls.
 * Uses SiliconFlow API with Qwen/Qwen2.5-72B-Instruct-128K.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createActor } from 'xstate';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { DeviationReport } from '../types';

type DeviationMachine = ReturnType<typeof import('../deviation-machine')['createDeviationMachine']>;

// Load .env
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), 'config/.env');
    const env = readFileSync(envPath, 'utf-8');
    for (const line of env.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // Ignore
  }
}

describe('E2E Workflow with Real LLM', () => {
  let machine: DeviationMachine;

  beforeAll(() => {
    loadEnv();
    console.log('=== E2E Workflow Test ===');
    console.log('LLM_PROVIDER:', process.env.LLM_API_KEY ? 'configured' : 'NOT configured');
  });

  it('should run complete workflow from clue to report', async () => {
    // Check API key at runtime
    if (!process.env.LLM_API_KEY) {
      console.log('⚠️  No LLM_API_KEY found, skipping E2E test');
      return;
    }

    // Dynamic imports to avoid ESM issues
    const { createDeviationMachine } = await import('../deviation-machine');
    
    machine = createDeviationMachine();
    const actor = createActor(machine);
    actor.start();

    // Sample deviation clue
    const clueText = `
产品：注射用头孢曲松钠
批号：C20240115
生产日期：2024-01-15
发现时间：2024-01-20

偏差描述：
在生产过程中，质量控制部门在中间产品含量测定时发现，3号生产线的一批注射用头孢曲松钠（批号C20240115）含量测定结果为88.5%，低于标准下限（90.0%）。该偏差于2024年1月20日在中间产品放行检验时被发现。

初步调查：
- 操作人员按照SOP进行操作
- 设备已按计划维护和校准
- 原辅料均有合格检验报告
- 生产环境温湿度记录正常
- 批记录显示无异常操作

该批产品价值约50万元，需尽快完成偏差调查并出具报告。
    `.trim();

    console.log('\n[Step 1] Sending SUBMIT event...');
    actor.send({ type: 'SUBMIT', clueText, files: [] });

    // Wait for completion with 10-minute timeout
    const result = await new Promise<{
      success: boolean;
      report?: DeviationReport;
      auditScore?: number;
      auditSummary?: string;
      error?: string;
      state?: string;
    }>((resolve) => {
      const timeout = setTimeout(() => {
        actor.stop();
        resolve({ success: false, error: 'Timeout after 10 minutes', state: 'timeout' });
      }, 10 * 60 * 1000);

      let lastState = 'input';
      let stepCount = 0;

      actor.subscribe((snapshot) => {
        const { context, value } = snapshot;
        const state = typeof value === 'string' ? value : String(value);

        if (state !== lastState) {
          stepCount++;
          console.log(`[Step ${stepCount}] State: ${state}, Step: ${context.currentStep}/7`);
          lastState = state;
        }

        // Success: reached review state (audit complete)
        if (value === 'review') {
          clearTimeout(timeout);
          actor.stop();
          resolve({
            success: true,
            report: context.report ?? undefined,
            auditScore: context.auditScore ?? undefined,
            auditSummary: context.auditSummary ?? undefined,
            state,
          });
        }

        // Error states
        if (state.startsWith('error_') || state === 'cancelled') {
          clearTimeout(timeout);
          actor.stop();
          resolve({
            success: false,
            error: context.error || 'Unknown error',
            state,
          });
        }
      });
    });

    console.log('\n=== Workflow Result ===');
    console.log('Success:', result.success);
    console.log('Final state:', result.state);

    if (result.success && result.report) {
      const report = result.report;
      console.log('\n--- Report Summary ---');
      console.log('Deviation ID:', report.deviationId);
      console.log('Risk Score:', report.riskScore);
      console.log('Risk Level:', report.riskLevel);
      console.log('Title:', report.title);

      // Check report sections
      expect(report.cover).toBeDefined();
      expect(report.background).toBeDefined();
      expect(report.investigation).toBeDefined();
      expect(report.conclusion).toBeDefined();
      expect(report.riskAssessment).toBeDefined();
      expect(report.capa).toBeDefined();
      expect(report.attachments).toBeDefined();

      // Verify key fields
      expect(report.deviationId).toMatch(/^DEV-/);
      expect(report.riskScore).toBeGreaterThanOrEqual(0);
      expect(report.riskScore).toBeLessThanOrEqual(100);
      expect(['high', 'medium', 'low']).toContain(report.riskLevel);

      // Audit results
      console.log('\n--- Audit Results ---');
      console.log('Score:', result.auditScore);
      console.log('Summary:', result.auditSummary?.slice(0, 200));

      expect(result.auditScore).toBeGreaterThanOrEqual(0);
      expect(result.auditScore).toBeLessThanOrEqual(100);
      expect(result.auditSummary).toBeDefined();
      expect(result.auditSummary!.length).toBeGreaterThan(0);

      console.log('\n=== E2E Test PASSED ===');
    } else {
      console.error('Workflow failed:', result.error);
      expect.fail(`Workflow failed: ${result.error}`);
    }
  }, 10 * 60 * 1000); // 10-minute timeout for test
});
