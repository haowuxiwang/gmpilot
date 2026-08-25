import { describe, it, expect } from 'vitest';
import { validateBaseUrl } from '../provider';

describe('validateBaseUrl (SSRF 防护)', () => {
  it('should allow valid https cloud URLs', () => {
    expect(() => validateBaseUrl('https://api.siliconflow.cn/v1')).not.toThrow();
    expect(() => validateBaseUrl('https://api.deepseek.com/v1')).not.toThrow();
  });

  it('should allow localhost for local providers (Ollama)', () => {
    expect(() => validateBaseUrl('http://localhost:11434', true)).not.toThrow();
    expect(() => validateBaseUrl('http://127.0.0.1:11434', true)).not.toThrow();
  });

  it('should allow localhost even for non-local providers with warning', () => {
    // 代理场景（如公司网关）合法使用，仅警告不阻断
    expect(() => validateBaseUrl('http://localhost:8080/v1', false)).not.toThrow();
  });

  it('should allow undefined/empty baseUrl', () => {
    expect(() => validateBaseUrl(undefined)).not.toThrow();
    expect(() => validateBaseUrl('')).not.toThrow();
  });

  it('should reject invalid URL format', () => {
    expect(() => validateBaseUrl('not-a-url')).toThrow(/格式无效/);
  });

  it('should reject non-http protocols', () => {
    expect(() => validateBaseUrl('ftp://example.com')).toThrow(/http\/https/);
    expect(() => validateBaseUrl('file:///etc/passwd')).toThrow(/http\/https/);
  });

  it('should reject http for cloud endpoints', () => {
    expect(() => validateBaseUrl('http://api.example.com/v1')).toThrow(/https/);
  });

  it('should reject private network IPs', () => {
    expect(() => validateBaseUrl('https://10.0.0.5/v1')).toThrow(/内网/);
    expect(() => validateBaseUrl('https://192.168.1.10/v1')).toThrow(/内网/);
    expect(() => validateBaseUrl('https://172.16.0.9/v1')).toThrow(/内网/);
    expect(() => validateBaseUrl('https://169.254.169.254/latest/meta-data')).toThrow(/内网/);
  });

  it('should reject internal/metadata hostnames', () => {
    expect(() => validateBaseUrl('https://metadata.google.internal/computeMetadata')).toThrow(/内网/);
    expect(() => validateBaseUrl('https://llm.corp.internal/v1')).toThrow(/内网/);
    expect(() => validateBaseUrl('https://printer.local/v1')).toThrow(/内网/);
  });
});
