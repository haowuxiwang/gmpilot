const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**', '*.config.*', 'e2e/**'],
  },
  js.configs.recommended,
  // TypeScript files — shared config
  {
    files: ['src/**/*.{ts,tsx}', 'electron/**/*.ts', 'core/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // TypeScript handles these — disable base rules
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  // Browser globals for renderer process
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // Node.js globals for main process and core logic
  {
    files: ['electron/**/*.ts', 'core/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
