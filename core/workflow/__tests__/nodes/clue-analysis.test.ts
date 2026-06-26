import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeClueNode } from '../../nodes/clue-analysis';

// Mock the LLM caller
const mockAnalyzeClue = vi.fn();
vi.mock('../../../llm/caller', () => ({
  analyzeClue: (...args: unknown[]) => mockAnalyzeClue(...args),
}));

describe('analyzeClueNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call LLM and return structured analysis', async () => {
    const mockResult = {
      summary: '在2024年3月15日，QA发现某批次产品存在偏差',
      keyEvents: ['发现偏差', '启动调查'],
      involvedParties: ['QA', '生产部'],
      documentType: 'deviation_analysis',
    };
    mockAnalyzeClue.mockResolvedValue(mockResult);

    const result = await analyzeClueNode('在2024年3月15日，QA发现某批次产品存在偏差...');

    expect(result).toEqual(mockResult);
    expect(mockAnalyzeClue).toHaveBeenCalledOnce();
    expect(mockAnalyzeClue).toHaveBeenCalledWith(expect.stringContaining('2024'));
  });

  it('should throw on empty clue text', async () => {
    await expect(analyzeClueNode('')).rejects.toThrow('线索内容不能为空');
  });

  it('should throw on whitespace-only clue text', async () => {
    await expect(analyzeClueNode('   ')).rejects.toThrow('线索内容不能为空');
  });

  it('should propagate LLM errors', async () => {
    mockAnalyzeClue.mockRejectedValue(new Error('LLM API error'));

    await expect(analyzeClueNode('some clue text')).rejects.toThrow('LLM API error');
  });

  it('should pass the full clue text to LLM', async () => {
    const mockResult = {
      summary: 'summary',
      keyEvents: [],
      involvedParties: [],
      documentType: 'deviation_analysis',
    };
    mockAnalyzeClue.mockResolvedValue(mockResult);

    const clueText = 'This is a detailed clue about a deviation in batch 2024-001';
    await analyzeClueNode(clueText);

    expect(mockAnalyzeClue).toHaveBeenCalledWith(clueText);
  });

  it('should return result with all required fields', async () => {
    const mockResult = {
      summary: '测试摘要',
      keyEvents: ['事件1', '事件2'],
      involvedParties: ['QA', '生产部', '质量部'],
      documentType: 'sop_compliance',
    };
    mockAnalyzeClue.mockResolvedValue(mockResult);

    const result = await analyzeClueNode('测试线索');

    expect(result.summary).toBe('测试摘要');
    expect(result.keyEvents).toHaveLength(2);
    expect(result.involvedParties).toHaveLength(3);
    expect(result.documentType).toBe('sop_compliance');
  });
});
