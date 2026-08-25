import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchRegulationsNode } from '../../nodes/regulation-match';

vi.mock('../../../llm/caller', () => ({
  matchRegulations: vi.fn().mockResolvedValue([
    {
      regulation: '中国GMP',
      chapter: '第二章 质量管理',
      article: '第十条',
      title: '偏差处理',
      content: '企业应当建立偏差处理程序。',
      relevance: '直接适用',
    },
  ]),
}));

describe('matchRegulationsNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return matched regulations', async () => {
    const result = await matchRegulationsNode(
      '测试线索',
      { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
      '法规参考内容',
    );
    expect(result).toHaveLength(1);
    expect(result[0].regulation).toBe('中国GMP');
    expect(result[0].chapter).toContain('质量管理');
  });
});
