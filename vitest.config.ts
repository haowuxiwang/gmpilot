import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['core/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [
      ['src/**', 'jsdom'],
    ],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 1,
        minThreads: 1,
      },
    },
    deps: {
      optimizer: {
        ssr: {
          include: ['better-sqlite3'],
        },
      },
    },
    coverage: {
      provider: 'v8',
      include: ['core/**/*.ts', 'src/hooks/**/*.ts'],
      exclude: [
        'core/**/*.d.ts',
        'core/**/__tests__/**',
        'src/**/__tests__/**',
        'core/integration/**',
        'core/pdf/**',
        'core/workflow/types.ts',         // Pure type definitions, no executable code
        'core/workflow/report-types.ts',  // Auto-generated type definitions
        'core/workflow/modules/index.ts', // Pure re-exports, no executable code
        'core/template/types.ts',         // Pure type definitions
        'core/types/ipc.ts',             // Pure type definitions
        'core/utils/secure-storage.ts',  // Requires Electron APIs, tested via integration
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 120000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './core'),
    },
  },
});
