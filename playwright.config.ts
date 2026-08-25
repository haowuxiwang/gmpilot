import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import os from 'os';

/**
 * Playwright configuration for GMPilot renderer testing.
 * Uses Vite dev server (port 5173) with mocked Electron IPC.
 */

// Use full Chromium browser (avoid headless-shell download requirement)
const chromiumExecPath = path.join(
  os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'
);

export default defineConfig({
  testDir: './e2e',
  // Packaged build E2E runs via playwright.packaged.config.ts (launches real exe, not dev server)
  testIgnore: /packaged\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: chromiumExecPath,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:renderer',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
