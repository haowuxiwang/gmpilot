/**
 * Navigation tests - Sidebar navigation between pages.
 */

import { test, expect } from '@playwright/test';
import { mockGmpilotAPI } from './fixtures/mock-gmpilot';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockGmpilotAPI(page);
  });

  test('should display sidebar with 4 navigation items', async ({ page }) => {
    await page.goto('/');

    // Check sidebar exists - use the aside with w-[240px]
    const sidebar = page.locator('aside.w-\\[240px\\]');
    await expect(sidebar).toBeVisible();

    // Check 4 nav items
    const navButtons = sidebar.locator('nav button');
    await expect(navButtons).toHaveCount(4);

    // Check labels
    await expect(navButtons.nth(0)).toContainText('智能助手');
    await expect(navButtons.nth(1)).toContainText('偏差报告');
    await expect(navButtons.nth(2)).toContainText('知识库');
    await expect(navButtons.nth(3)).toContainText('设置');
  });

  test('should navigate to reports page', async ({ page }) => {
    await page.goto('/');

    // Click "偏差报告"
    await page.locator('nav button').filter({ hasText: '偏差报告' }).click();

    // Should be on /#/reports
    await expect(page).toHaveURL('/#/reports');
  });

  test('should navigate to knowledge page', async ({ page }) => {
    await page.goto('/');

    // Click "知识库"
    await page.locator('nav button').filter({ hasText: '知识库' }).click();

    // Should be on /#/knowledge
    await expect(page).toHaveURL('/#/knowledge');
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/');

    // Click "设置"
    await page.locator('nav button').filter({ hasText: '设置' }).click();

    // Should be on /#/settings
    await expect(page).toHaveURL('/#/settings');
  });

  test('should show 404 for unknown routes', async ({ page }) => {
    await page.goto('/#/unknown-route');

    // Should show 404 page
    await expect(page.locator('text=404')).toBeVisible();
    await expect(page.locator('text=页面未找到')).toBeVisible();
  });

  test('should highlight active nav item', async ({ page }) => {
    await page.goto('/#/reports');

    // The "偏差报告" button should have active style (white bg with shadow)
    const activeButton = page.locator('nav button').filter({ hasText: '偏差报告' });
    await expect(activeButton).toHaveClass(/bg-white/);
  });
});
