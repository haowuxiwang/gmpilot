/**
 * Playwright config for packaged build E2E testing.
 * Launches release/win-unpacked/GMPilot.exe (real Electron app).
 * No dev server required.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /packaged\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
