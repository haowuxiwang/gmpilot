/**
 * Custom hook for streaming LLM output.
 * Subscribes to llm:stream events and accumulates text.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

interface UseLLMStreamOptions {
  onComplete?: (text: string) => void;
  onError?: (error: string) => void;
}

function hasLLM(): boolean {
  return typeof window !== 'undefined' && !!window.gmpilot?.llm;
}

export function useLLMStream(options?: UseLLMStreamOptions) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to store latest text value for callbacks
  const textRef = useRef('');
  textRef.current = text;

  // Use ref to store latest options to avoid stale closure
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    return () => {
      if (hasLLM()) window.gmpilot.llm.offStream();
    };
  }, []);

  const startStream = useCallback(async (params: { prompt: string; systemPrompt?: string }) => {
    if (!hasLLM()) {
      setError('请在 Electron 环境中运行');
      return;
    }

    setText('');
    setStreaming(true);
    setError(null);

    // C-10 fix: Clean up any existing listeners before registering new ones
    window.gmpilot.llm.offStream();

    // Set up event listeners
    window.gmpilot.llm.onChunk((data) => {
      setText((prev) => prev + data.chunk);
    });

    window.gmpilot.llm.onDone(() => {
      setStreaming(false);
      window.gmpilot.llm.offStream();
      // Use ref to get latest text value
      optionsRef.current?.onComplete?.(textRef.current);
    });

    window.gmpilot.llm.onError((data) => {
      setError(data.error);
      setStreaming(false);
      window.gmpilot.llm.offStream();
      optionsRef.current?.onError?.(data.error);
    });

    // Start streaming
    const result = await window.gmpilot.llm.stream(params);
    if (!result.success) {
      setError(result.error || 'Stream failed');
      setStreaming(false);
      window.gmpilot.llm.offStream();
    }
  }, []); // No dependencies needed - using refs

  const reset = useCallback(() => {
    setText('');
    setStreaming(false);
    setError(null);
    if (hasLLM()) window.gmpilot.llm.offStream();
  }, []);

  return {
    text,
    streaming,
    error,
    startStream,
    reset,
  };
}
