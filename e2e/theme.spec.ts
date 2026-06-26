/**
 * Theme tests - Light/system mode switching.
 */

import { test, expect } from '@playwright/test';
import { mockGmpilotAPI } from './fixtures/mock-gmpilot';

test.describe('Theme', () => {
  test.beforeEach(async ({ page }) => {
    await mockGmpilotAPI(page);
  });

  test('should display theme toggle in sidebar', async ({ page }) => {
    await page.goto('/');

    // Should have theme toggle button
    const themeToggle = page.locator('aside button').filter({ hasText: /浅色|跟随系统/ });
    await expect(themeToggle).toBeVisible();
  });

  test('should toggle between light and system themes', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('aside button').filter({ hasText: /浅色|跟随系统/ });

    // Initial state should be "浅色" or "跟随系统"
    const initialText = await themeToggle.textContent();

    // Click to change theme
    await themeToggle.click();

    // Text should change
    const newText = await themeToggle.textContent();
    expect(newText).not.toBe(initialText);

    // Click again to toggle back
    await themeToggle.click();
    const finalText = await themeToggle.textContent();
    expect(finalText).toBe(initialText);
  });
});
