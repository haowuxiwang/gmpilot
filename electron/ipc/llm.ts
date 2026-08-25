/**
 * LLM IPC handlers for Electron main process.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getProviderConfig, createLLMModel, PROVIDER_LIST } from '../../core/llm/provider';
import { callLLMWithRetry, LLMAuthError } from '../../core/llm/caller';
import { generateText, streamText } from 'ai';
import { createLogger } from '../../core/utils/logger';

const log = createLogger('LLM-IPC');

export function registerLLMIPC(): void {
  // Test LLM connectivity with latency measurement
  ipcMain.handle('llm:test', async (_event, provider?: string) => {
    const start = Date.now();
    try {
      const config = getProviderConfig(provider);
      const model = createLLMModel(config);
      await callLLMWithRetry(
        () => generateText({ model, prompt: 'Say "ok"' }),
        { node: 'test', timeoutMs: 30000 },
      );
      const latency = Date.now() - start;
      log.info('llm:test success', { provider: config.provider, latency });
      return { success: true, provider: config.provider, latency };
    } catch (error) {
      const latency = Date.now() - start;
      log.error('llm:test failed', { provider, latency, error: String(error) });
      if (error instanceof LLMAuthError) {
        return { success: false, error: error.message, latency };
      }
      return { success: false, error: error instanceof Error ? error.message : '操作失败', latency };
    }
  });

  // Get all providers (for UI selection)
  ipcMain.handle('llm:providers', () => {
    return PROVIDER_LIST;
  });

  // Max prompt length: 100,000 characters
  const MAX_PROMPT_LENGTH = 100_000;

  // Generate text (non-streaming)
  ipcMain.handle('llm:generate', async (_event, params: { prompt: string; systemPrompt?: string }) => {
    // Check input length
    if (params.prompt && params.prompt.length > MAX_PROMPT_LENGTH) {
      return { success: false, error: `输入内容过长（最多 ${MAX_PROMPT_LENGTH.toLocaleString()} 字符）` };
    }

    try {
      const config = getProviderConfig();
      const model = createLLMModel(config);
      const result = await callLLMWithRetry(
        () => generateText({
          model,
          prompt: params.prompt,
          system: params.systemPrompt,
        }),
        { node: 'generate' },
      );
      return { success: true, text: result.text };
    } catch (error) {
      log.error('llm:generate failed', { error: String(error) });
      if (error instanceof LLMAuthError) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error instanceof Error ? error.message : '操作失败' };
    }
  });

  // Stream text generation with timeout protection
  ipcMain.handle('llm:stream', async (event, params: { prompt: string; systemPrompt?: string }) => {
    // Check input length
    if (params.prompt && params.prompt.length > MAX_PROMPT_LENGTH) {
      return { success: false, error: `输入内容过长（最多 ${MAX_PROMPT_LENGTH.toLocaleString()} 字符）` };
    }

    try {
      const config = getProviderConfig();
      const model = createLLMModel(config);

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutMs = 5 * 60 * 1000; // 5 minutes
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let stream;
      try {
        stream = await streamText({
          model,
          prompt: params.prompt,
          system: params.systemPrompt,
          abortSignal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }

      // Send stream chunks to renderer
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        clearTimeout(timeoutId);
        return { success: false, error: 'Window not found' };
      }

      // Process stream in background
      (async () => {
        try {
          for await (const chunk of stream.textStream) {
            if (window.isDestroyed()) {
              clearTimeout(timeoutId);
              return;
            }
            window.webContents.send('llm:stream:chunk', { chunk });
          }
          clearTimeout(timeoutId);
          if (!window.isDestroyed()) {
            window.webContents.send('llm:stream:done');
          }
        } catch (error) {
          clearTimeout(timeoutId);
          log.error('llm:stream chunk error', { error: String(error) });
          if (!window.isDestroyed()) {
            window.webContents.send('llm:stream:error', { error: String(error) });
          }
        }
      })();

      return { success: true };
    } catch (error) {
      log.error('llm:stream failed', { error: String(error) });
      if (error instanceof LLMAuthError) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error instanceof Error ? error.message : '操作失败' };
    }
  });
}
