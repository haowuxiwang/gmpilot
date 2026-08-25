/**
 * 临时视觉确认截图 spec（确认后删除）
 */
import { test, expect } from '@playwright/test';

test('screenshot home empty state', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'visual-shots/1-home-empty.png', fullPage: true });
  await expect(page.locator('body')).toBeVisible();
});

test('screenshot sidebar collapsed', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(600);
  await page.getByTitle('折叠侧边栏').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'visual-shots/2-sidebar-collapsed.png', fullPage: true });
});

test('screenshot history panel open', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(600);
  await page.getByTitle('历史对话').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'visual-shots/3-history-panel.png', fullPage: true });
});

test('screenshot settings page', async ({ page }) => {
  await page.goto('/settings');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'visual-shots/4-settings.png', fullPage: true });
});
