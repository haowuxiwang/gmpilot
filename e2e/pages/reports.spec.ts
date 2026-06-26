/**
 * ReportsPage tests - Report listing, search, and actions.
 */

import { test, expect } from '@playwright/test';
import { mockGmpilotAPI } from '../fixtures/mock-gmpilot';

test.describe('ReportsPage', () => {
  test.beforeEach(async ({ page }) => {
    await mockGmpilotAPI(page);
    await page.goto('/reports');
  });

  test('should display page header', async ({ page }) => {
    // Use main content area h1 (not sidebar h1)
    await expect(page.locator('main h1')).toContainText('偏差报告');
    await expect(page.locator('text=查看和管理所有偏差报告')).toBeVisible();
  });

  test('should display report table with mock data', async ({ page }) => {
    // Should have table
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Should have 2 reports from mock
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    // First report
    await expect(rows.nth(0).locator('td').nth(1)).toContainText('片剂重量偏差调查');

    // Second report
    await expect(rows.nth(1).locator('td').nth(1)).toContainText('原料纯度异常分析');
  });

  test('should display risk badges', async ({ page }) => {
    const table = page.locator('table');

    // Medium risk badge
    await expect(table.locator('text=中风险')).toBeVisible();

    // High risk badge
    await expect(table.locator('text=高风险')).toBeVisible();
  });

  test('should filter reports by search', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await expect(searchInput).toBeVisible();

    // Search for "片剂"
    await searchInput.fill('片剂');

    // Should show only 1 report
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('td').nth(1)).toContainText('片剂重量偏差调查');
  });

  test('should show empty state when no search results', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await searchInput.fill('不存在的报告');

    // Should show empty state
    await expect(page.locator('text=未找到匹配的报告')).toBeVisible();
  });

  test('should have action buttons for each report', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();

    // Should have view, download, delete buttons
    const actionButtons = firstRow.locator('button');
    const count = await actionButtons.count();
    expect(count).toBeGreaterThanOrEqual(2); // At least view and delete
  });
});
