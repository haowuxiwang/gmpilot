/**
 * SettingsPage tests - LLM configuration form.
 */

import { test, expect } from '@playwright/test';
import { mockGmpilotAPI } from '../fixtures/mock-gmpilot';

test.describe('SettingsPage', () => {
  test.beforeEach(async ({ page }) => {
    await mockGmpilotAPI(page);
    await page.goto('/settings');
  });

  test('should display LLM config form', async ({ page }) => {
    // Should have Provider selector
    await expect(page.locator('label').filter({ hasText: 'Provider' })).toBeVisible();
    // Should have form fields
    await expect(page.locator('label').filter({ hasText: 'API 地址' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: '模型名称' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'API 密钥' })).toBeVisible();
  });

  test('should display save button', async ({ page }) => {
    const saveButton = page.locator('button').filter({ hasText: '保存设置' });
    await expect(saveButton).toBeVisible();
  });

  test('should have correct input types', async ({ page }) => {
    // API Key should be password type
    const apiKeyInput = page.locator('input[type="password"]');
    await expect(apiKeyInput).toBeVisible();
  });

  test('should have test connection button', async ({ page }) => {
    // Should have test connection button
    const testButton = page.locator('button').filter({ hasText: '测试连接' }).first();
    await expect(testButton).toBeVisible();
  });
});
