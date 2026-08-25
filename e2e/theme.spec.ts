/**
 * Theme tests — 主题持久化机制（light/dark）。
 * 注：redesign 后侧边栏主题切换按钮已移除（useTheme 无 UI 入口），
 * 此处仅验证 localStorage 持久化的默认浅色渲染不受影响。
 */

import { test, expect } from '@playwright/test';
import { mockGmpilotAPI } from './fixtures/mock-gmpilot';

test.describe('Theme', () => {
  test.beforeEach(async ({ page }) => {
    await mockGmpilotAPI(page);
  });

  test('should render app with default light theme', async ({ page }) => {
    await page.goto('/');

    // App shell renders with default styling (no dark class on root)
    const html = page.locator('html');
    await expect(html).toBeVisible();
    const cls = await html.getAttribute('class');
    expect(cls ?? '').not.toContain('dark');
  });

  test('should persist theme preference in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('gmpilot-theme', 'dark');
    });
    await page.reload();
    const stored = await page.evaluate(() => localStorage.getItem('gmpilot-theme'));
    expect(stored).toBe('dark');
  });
});
