/**
 * NotFoundPage tests - 404 error page.
 */

import { test, expect } from '@playwright/test';
import { mockGmpilotAPI } from '../fixtures/mock-gmpilot';

test.describe('NotFoundPage', () => {
  test.beforeEach(async ({ page }) => {
    await mockGmpilotAPI(page);
  });

  test('should display 404 page for unknown routes', async ({ page }) => {
    await page.goto('/#/this-page-does-not-exist');

    // Should show 404
    await expect(page.locator('text=404')).toBeVisible();

    // Should show message
    await expect(page.locator('text=页面未找到')).toBeVisible();

    // Should show description
    await expect(page.locator('text=您访问的页面不存在或已被移除')).toBeVisible();
  });

  test('should have return home button', async ({ page }) => {
    await page.goto('/#/unknown');

    // Should have a button to return home
    const homeButton = page.locator('button').filter({ hasText: '返回首页' });
    await expect(homeButton).toBeVisible();
  });

  test('should navigate home when clicking return button', async ({ page }) => {
    await page.goto('/#/unknown');

    // Click return home
    await page.locator('button').filter({ hasText: '返回首页' }).click();

    // Should be on home page
    await expect(page).toHaveURL('/#/');
  });
});
