#!/usr/bin/env node
/**
 * LLM Connectivity Test Script
 * Tests SiliconFlow API connectivity for GMPilot
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../config/.env') });

interface TestResult {
  name: string;
  success: boolean;
  latencyMs?: number;
  error?: string;
  details?: unknown;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log('=== GMPilot LLM Connectivity Test ===\n');

  // Test 1: Provider Initialization
  console.log('1. Testing Provider Initialization...');
  try {
    const startTime = Date.now();
    const { getProviderConfig, createLLMModel } = await import('../core/llm/provider');
    
    const config = getProviderConfig();
    const model = createLLMModel(config);
    
    results.push({
      name: 'Provider Initialization',
      success: true,
      latencyMs: Date.now() - startTime,
      details: {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        apiKeyPrefix: config.apiKey.substring(0, 10) + '...',
      },
    });
    console.log('   ✓ Provider initialized successfully');
    console.log(`     Provider: ${config.provider}`);
    console.log(`     Model: ${config.model}`);
  } catch (error) {
    results.push({
      name: 'Provider Initialization',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log('   ✗ Provider initialization failed');
  }

  // Test 2: Health Check
  console.log('\n2. Testing Health Check...');
  try {
    const startTime = Date.now();
    const { healthCheckProvider } = await import('../core/llm/provider');
    
    const healthResult = await healthCheckProvider();
    
    results.push({
      name: 'Health Check',
      success: healthResult.ok,
      latencyMs: healthResult.latencyMs,
      error: healthResult.error,
      details: {
        provider: healthResult.provider,
        model: healthResult.model,
      },
    });
    
    if (healthResult.ok) {
      console.log('   ✓ Health check passed');
      console.log(`     Latency: ${healthResult.latencyMs}ms`);
    } else {
      console.log('   ✗ Health check failed');
      console.log(`     Error: ${healthResult.error}`);
    }
  } catch (error) {
    results.push({
      name: 'Health Check',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log('   ✗ Health check failed with exception');
  }

  // Test 3: Simple LLM Call
  console.log('\n3. Testing Simple LLM Call...');
  try {
    const startTime = Date.now();
    const { generateText } = await import('ai');
    const { createLLMModel, getProviderConfig } = await import('../core/llm/provider');
    
    const config = getProviderConfig();
    const model = createLLMModel(config);
    
    const result = await generateText({
      model,
      prompt: 'Say "Hello from GMPilot" in exactly 5 words.',
      maxTokens: 20,
    });
    
    results.push({
      name: 'Simple LLM Call',
      success: true,
      latencyMs: Date.now() - startTime,
      details: {
        response: result.text,
        usage: result.usage,
      },
    });
    console.log('   ✓ LLM call successful');
    console.log(`     Response: "${result.text.trim()}"`);
    console.log(`     Tokens: ${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion`);
  } catch (error) {
    results.push({
      name: 'Simple LLM Call',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log('   ✗ LLM call failed');
    console.log(`     Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 4: Streaming
  console.log('\n4. Testing Streaming...');
  try {
    const startTime = Date.now();
    const { streamText } = await import('ai');
    const { createLLMModel, getProviderConfig } = await import('../core/llm/provider');
    
    const config = getProviderConfig();
    const model = createLLMModel(config);
    
    const result = streamText({
      model,
      prompt: 'Count from 1 to 5, one number per line.',
      maxTokens: 50,
    });
    
    let chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
      process.stdout.write(chunk);
    }
    
    const latencyMs = Date.now() - startTime;
    results.push({
      name: 'Streaming',
      success: true,
      latencyMs,
      details: {
        chunksReceived: chunks.length,
        totalLength: chunks.join('').length,
      },
    });
    console.log('\n   ✓ Streaming successful');
    console.log(`     Chunks received: ${chunks.length}`);
  } catch (error) {
    results.push({
      name: 'Streaming',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log('   ✗ Streaming failed');
    console.log(`     Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 5: Retry Logic (simulated)
  console.log('\n5. Testing Retry Logic...');
  try {
    const startTime = Date.now();
    const { callLLMWithRetry } = await import('../core/llm/caller');
    const { createLLMModel, getProviderConfig } = await import('../core/llm/provider');
    
    const config = getProviderConfig();
    const model = createLLMModel(config);
    
    const result = await callLLMWithRetry(
      async (signal) => {
        const { generateText } = await import('ai');
        return generateText({
          model,
          prompt: 'Reply with just "OK"',
          maxTokens: 5,
          abortSignal: signal,
        });
      },
      { node: 'test-retry', provider: config.provider, maxRetries: 1 },
    );
    
    results.push({
      name: 'Retry Logic',
      success: true,
      latencyMs: Date.now() - startTime,
      details: {
        response: result.text,
      },
    });
    console.log('   ✓ Retry logic working');
  } catch (error) {
    results.push({
      name: 'Retry Logic',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log('   ✗ Retry logic test failed');
  }

  return results;
}

async function main() {
  try {
    const results = await runTests();
    
    console.log('\n=== Test Summary ===\n');
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    for (const result of results) {
      const status = result.success ? '✓' : '✗';
      const latency = result.latencyMs ? ` (${result.latencyMs}ms)` : '';
      console.log(`${status} ${result.name}${latency}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    }
    
    console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${results.length} tests`);
    
    if (failed > 0) {
      console.log('\n⚠️  Some tests failed. Check the errors above for details.');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed! LLM connectivity is working correctly.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Test script failed:', error);
    process.exit(1);
  }
}

main();
