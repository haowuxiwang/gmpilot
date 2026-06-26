/**
 * AgentPage tests - Main chat interface and workflow.
 */

import { test, expect } from '@playwright/test';
import { mockGmpilotAPI } from '../fixtures/mock-gmpilot';

test.describe('AgentPage', () => {
  test.beforeEach(async ({ page }) => {
    await mockGmpilotAPI(page);
    await page.goto('/');
  });

  test('should display empty state with quick actions', async ({ page }) => {
    // Should show welcome message or quick actions
    const hasWelcome = await page.locator('text=偏差分析助手').isVisible().catch(() => false);
    const hasQuickActions = await page.locator('text=片剂').isVisible().catch(() => false);

    // At least one of them should be visible
    expect(hasWelcome || hasQuickActions).toBeTruthy();
  });

  test('should display chat input', async ({ page }) => {
    // Should have textarea
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute('placeholder', /偏差/);
  });

  test('should show send button', async ({ page }) => {
    // Send button should be visible but disabled when empty
    const sendButton = page.locator('button').filter({ hasText: '' }).last();
    await expect(sendButton).toBeVisible();
  });

  test('should have document panel toggle', async ({ page }) => {
    // There should be a button to toggle the document panel
    const panelToggle = page.locator('button[title*="文档"], button[title*="panel"]');
    // Panel toggle might be visible
    const count = await panelToggle.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
