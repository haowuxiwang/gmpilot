/**
 * KnowledgePage tests - Knowledge document listing, search, and actions.
 */

import { test, expect } from '@playwright/test';
import { mockGmpilotAPI } from '../fixtures/mock-gmpilot';

test.describe('KnowledgePage', () => {
  test.beforeEach(async ({ page }) => {
    await mockGmpilotAPI(page);
    await page.goto('/#/knowledge');
  });

  test('should display page header', async ({ page }) => {
    // Use main content area h1 (not sidebar h1)
    await expect(page.locator('main h1')).toContainText('知识库');
    await expect(page.locator('text=管理法规文档和内部文档')).toBeVisible();
  });

  test('should display upload button', async ({ page }) => {
    const uploadButton = page.locator('button').filter({ hasText: '上传法规' });
    await expect(uploadButton).toBeVisible();
  });

  test('should display document table with mock data', async ({ page }) => {
    // Should have table
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Should have 2 documents from mock
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    // First document
    await expect(rows.nth(0).locator('td').first()).toContainText('药品生产质量管理规范.txt');

    // Second document
    await expect(rows.nth(1).locator('td').first()).toContainText('内部SOP-偏差处理.txt');
  });

  test('should display source badges', async ({ page }) => {
    const table = page.locator('table');

    // Builtin badge
    await expect(table.locator('text=内置')).toBeVisible();

    // User badge
    await expect(table.locator('text=用户')).toBeVisible();
  });

  test('should display chunk counts', async ({ page }) => {
    const table = page.locator('table');

    // Chunk counts
    await expect(table.locator('text=42')).toBeVisible();
    await expect(table.locator('text=15')).toBeVisible();
  });

  test('should filter documents by search', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await expect(searchInput).toBeVisible();

    // Search for "SOP"
    await searchInput.fill('SOP');

    // Should show only 1 document
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('td').first()).toContainText('内部SOP-偏差处理.txt');
  });

  test('should show empty state when no search results', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await searchInput.fill('不存在的文档');

    // Should show empty state
    await expect(page.locator('text=未找到匹配的文档')).toBeVisible();
  });

  test('should have delete button for user documents', async ({ page }) => {
    const userRow = page.locator('table tbody tr').nth(1);

    // User document should have delete button
    const deleteButton = userRow.locator('button[title="删除"]');
    await expect(deleteButton).toBeVisible();
  });
});
