import { describe, it, expect } from 'vitest';
import { extractFactoryDeviationId, generateFallbackDeviationId } from '../deviation-id';

describe('extractFactoryDeviationId', () => {
  it('extracts factory deviation ID from clue text', () => {
    const text = '2026.03.23 10:48，偏差编号 D-TZ-API-EG-26003，灭菌柜温度探头故障';
    expect(extractFactoryDeviationId(text)).toBe('D-TZ-API-EG-26003');
  });

  it('returns null when no factory deviation ID present', () => {
    expect(extractFactoryDeviationId('2026.03.23 10:48 探头无数值')).toBeNull();
    expect(extractFactoryDeviationId('')).toBeNull();
    expect(extractFactoryDeviationId(undefined)).toBeNull();
    expect(extractFactoryDeviationId(null)).toBeNull();
  });

  it('returns first match when multiple IDs present', () => {
    const text = '关联 D-TZ-API-EG-26002 与 D-TZ-API-EG-26003';
    expect(extractFactoryDeviationId(text)).toBe('D-TZ-API-EG-26002');
  });

  it('does not match non-factory formats', () => {
    expect(extractFactoryDeviationId('编号 DEV-ABC12345')).toBeNull();
    expect(extractFactoryDeviationId('CP-TZ-API-D-TZ-API-EG-26003-26001')).toBeNull();
    expect(extractFactoryDeviationId('D-12345')).toBeNull();
  });
});

describe('generateFallbackDeviationId', () => {
  it('generates a DEV-prefixed ID', () => {
    expect(generateFallbackDeviationId()).toMatch(/^DEV-/);
    expect(generateFallbackDeviationId()).not.toBe(generateFallbackDeviationId());
  });
});
