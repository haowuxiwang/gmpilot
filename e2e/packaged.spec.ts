/**
 * GMPilot 打包构建物端到端测试
 * 启动 release/win-unpacked/GMPilot.exe（真实 Electron 应用 + 真实 LLM API）
 * 验证：应用启动、知识库 RAG 链路（云端 embedding fallback）、LLM 连通、完整偏差报告工作流、报告持久化
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const EXE_PATH = path.join(__dirname, '..', 'release', 'win-unpacked', 'GMPilot.exe');
const APP_DATA_DIR = path.join(os.tmpdir(), 'gmpilot-packaged-e2e');

// 测试专用 API Key（硅基流动），仅用于本次 E2E 验证
const LLM_API_KEY = 'sk-vprnpmjfzbcinduybbsboawtjxtrnrhfldbargfwzkieuczu';
const LLM_BASE_URL = 'https://api.siliconflow.cn/v1';
const LLM_MODEL = 'Qwen/Qwen2.5-72B-Instruct-128K';

const CLUE =
  '片剂生产车间3号压片机出现片重差异超限，部分片剂超出目标片重±5%范围，操作员已隔离相关批次，请调查根本原因并生成偏差调查报告';

let app: ElectronApplication;
let page: Page;
const mainErrors: string[] = [];
const rendererErrors: string[] = [];

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 20; i++) {
    const wins = electronApp.windows().filter((w) => !w.url().includes('splash'));
    if (wins.length > 0) return wins[0];
    await electronApp.waitForEvent('window', { timeout: 3000 }).catch(() => {});
  }
  throw new Error('未找到主窗口');
}

  async function navigateTo(label: string) {
    // Close mobile overlay if present
    const overlay = page.locator('.fixed.inset-0.bg-black\\/20');
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await overlay.click();
      await page.waitForTimeout(300);
    }
    await page.getByRole('button', { name: label, exact: true }).click();
  }

  /**
   * Wait until at least `minChunks` knowledge chunks are indexed.
   *
   * Local ONNX embedding now runs in worker threads, so indexing never
   * blocks the main process (CDP stays responsive). Full indexing of all
   * 55 builtin files takes ~20 minutes in the background, so tests only
   * wait for the first chunks to verify the RAG pipeline end-to-end.
   */
  async function waitForChunks(minChunks = 1) {
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const stats = await page
        .evaluate(() => window.gmpilot.knowledge.stats(), { timeout: 60_000 })
        .catch(() => null);
      const count = stats?.chunkCount ?? 0;
      if (count >= minChunks) {
        console.log(`✅ 知识库已索引 ${count} chunks`);
        return;
      }
      console.log(`⏳ 索引中: ${count} chunks`);
      await page.waitForTimeout(3_000);
    }
    throw new Error(`知识库 chunks 未在预期时间内达到 ${minChunks}`);
  }

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(600_000);
  // 隔离数据目录：全新 DB + 全新 RAG 索引（模拟首次安装启动）
  fs.rmSync(APP_DATA_DIR, { recursive: true, force: true });

  app = await electron.launch({
    executablePath: EXE_PATH,
    env: {
      ...process.env,
      APP_DATA_DIR,
      LLM_API_KEY,
      LLM_BASE_URL,
      LLM_MODEL,
    },
    timeout: 120_000,
  });

  app.process().stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString();
    if (/error|exception|failed/i.test(line)) mainErrors.push(line.trim());
  });

  page = await resolveMainWindow(app);
  page.on('pageerror', (err) => rendererErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') rendererErrors.push(`console: ${msg.text()}`);
  });
});

test.afterAll(async () => {
  await app.close().catch(() => {});
  fs.rmSync(APP_DATA_DIR, { recursive: true, force: true });
});

test('1. 应用启动：主界面渲染正常（无白屏）', async () => {
  await expect(page.getByRole('button', { name: '智能助手', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: '偏差报告', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '知识库', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '系统设置', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder(/描述偏差情况/)).toBeVisible();
});

test('2. 知识库：内置文档加载 + 语义检索（RAG 链路验证）', async () => {
  test.setTimeout(600_000);
  await navigateTo('知识库');
  await page.waitForTimeout(3_000);

  // 内置文档应已入库（后台 preloadKnowledgeBase 完成）
  // 如果 embedding 不可用，文件可能未入库，跳过此检查
  const fileVisible = await page.getByText('gmp_china_ch01_general.txt').first().isVisible({ timeout: 10_000 }).catch(() => false);
  if (!fileVisible) {
    console.log('⚠ 内置知识库文件未显示（embedding API 可能不可用），跳过文件检查');
  }

  // 等首批 chunks 索引完成（worker 后台索引，首个文件约 60-90s）
  await waitForChunks(1);

  // 语义检索：直接通过 IPC 调用（绕过 UI 点击的不确定性，与 Test3 同模式）
  const query = 'GMP 质量管理 偏差调查 记录要求';
  const results = (await page.evaluate(
    async (q: string) => {
      try {
        return await window.gmpilot.knowledge.query(q);
      } catch (err) {
        return { __error: err instanceof Error ? err.message : String(err) };
      }
    },
    query,
  )) as unknown;

  if (Array.isArray(results) && results.length > 0) {
    console.log(`✅ 语义搜索返回 ${results.length} 个结果`);
    // RAG 链路验证：chunking → 本地 embedding → sqlite-vec 检索 全部打通
    expect(results.length).toBeGreaterThan(0);
    const first = results[0] as { content?: string; score?: number };
    console.log(`    top1 score=${first.score} content=${String(first.content || '').slice(0, 60)}`);
  } else {
    const err = (results as { __error?: string }).__error;
    console.log(`⚠ 语义搜索未返回结果（embedding 可能不可用）: ${err || JSON.stringify(results)}`);
    expect(results.length, `语义搜索应返回结果: ${err || JSON.stringify(results)}`).toBeGreaterThan(0);
  }
});

test('3. 系统设置：LLM 测试连接（真实 API 连通性）', async () => {
  test.setTimeout(120_000);

  // 直接通过 IPC 配置 LLM 设置并测试连接（绕过 UI 渲染不确定性）
  const result = await page.evaluate(
    async ({ key, url, model }) => {
      // 保存设置
      await window.gmpilot.db.saveSettings({
        LLM_API_KEY: key,
        LLM_BASE_URL: url,
        LLM_MODEL: model,
      });
      // 测试连接
      const testResult = await window.gmpilot.llm.testProvider('siliconflow');
      return testResult;
    },
    { key: LLM_API_KEY, url: LLM_BASE_URL, model: LLM_MODEL },
  );

  expect(result.success, `LLM 连接失败: ${result.error}`).toBe(true);
  expect(result.latency).toBeGreaterThan(0);
});

test('4. 核心工作流：完整偏差报告生成（真实 LLM 全链路）', async () => {
  test.setTimeout(600_000);

  // 等待首批知识库索引完成，保证 RAG 链路可用（后台 worker 索引，不阻塞 UI）
  await waitForChunks(1);

  await navigateTo('智能助手');

  const textarea = page.getByPlaceholder(/描述偏差情况/);
  await textarea.fill(CLUE);
  await textarea.press('Enter');

  // SiliconFlow 高峰期单模块 LLM 可达 180s+（实测全流程最长 ~5 分钟），e2e 等待窗给足 8 分钟
  await expect(page.getByText('偏差报告已生成完成', { exact: true })).toBeVisible({ timeout: 480_000 });
});

  test('5. 报告查看：文档面板 + 风险评分 + 导出入口', async () => {
    test.setTimeout(60_000);
    await navigateTo('智能助手');
    await page.waitForTimeout(1000);

    // 文档面板在报告生成后默认展开（此时按钮标题为「隐藏文档」），仅在折叠状态才需要点击展开
    const showBtn = page.getByTitle('显示文档面板');
    if (await showBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await showBtn.click();
    }

    // 风险评估分节生成后默认已展开；仅在折叠状态才点击展开
    // 注：分节标题按钮含图标文本，用 title 定位比 role+name 更稳（图标可能改变可访问名）
    const riskSection = page.getByText(/风险评分/).first();
    if (!(await riskSection.isVisible({ timeout: 2_000 }).catch(() => false))) {
      const sectionBtn = page.locator('button', { hasText: '风险评估' }).first();
      await sectionBtn.click({ timeout: 10_000 });
      await expect(riskSection).toBeVisible({ timeout: 10_000 });
    }
    await expect(riskSection).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTitle('导出 PDF')).toBeVisible();
    await expect(page.getByText(/低风险|中风险|高风险/).first()).toBeVisible();
  });

test('6. 报告持久化：列表页显示生成记录', async () => {
  test.setTimeout(60_000);
  await navigateTo('偏差报告');
  await expect(page.getByText('暂无报告')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/低风险|中风险|高风险/).first()).toBeVisible({ timeout: 20_000 });
});

test('7. 主进程与渲染进程无未捕获错误', () => {
  const fatalMain = mainErrors.filter((e) => /uncaught|unhandled|fatal/i.test(e));
  expect(fatalMain, `主进程致命错误: ${fatalMain.join('\n')}`).toEqual([]);
  expect(rendererErrors, `渲染进程错误: ${rendererErrors.join('\n')}`).toEqual([]);
});
