/**
 * Tests for module-utils.ts - mapFindingsToModules function.
 */

import { describe, it, expect } from 'vitest';
import { mapFindingsToModules } from '../module-utils';

describe('mapFindingsToModules', () => {
  describe('keyword matching', () => {
    it('should map background-related findings', () => {
      const findings = [
        { finding_type: 'missing_info', title: '背景描述不完整', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('background');
    });

    it('should map investigation-related findings', () => {
      const findings = [
        { finding_type: 'logic_flaw', title: '调查深度不足', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('investigation');
    });

    it('should map conclusion-related findings', () => {
      const findings = [
        { finding_type: 'logic_flaw', title: '结论逻辑不通', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('conclusion');
    });

    it('should map risk-related findings', () => {
      const findings = [
        { finding_type: 'compliance_risk', title: '风险评分未更新', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('riskAssessment');
    });

    it('should map CAPA-related findings', () => {
      const findings = [
        { finding_type: 'missing_info', title: '纠正措施不明确', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('capa');
    });

    it('should match keywords in description field', () => {
      const findings = [
        { finding_type: 'info', title: 'No match', description: '需要补充预防措施' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('capa');
    });
  });

  describe('finding_type fallback', () => {
    it('should map logic_flaw to investigation and conclusion', () => {
      const findings = [
        { finding_type: 'logic_flaw', title: 'Some logic issue', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('investigation');
      expect(result).toContain('conclusion');
    });

    it('should map compliance_risk to investigation', () => {
      const findings = [
        { finding_type: 'compliance_risk', title: 'Compliance issue', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('investigation');
    });

    it('should map missing_info to background', () => {
      const findings = [
        { finding_type: 'missing_info', title: 'Missing data', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('background');
    });
  });

  describe('default behavior', () => {
    it('should default to investigation when no keywords match', () => {
      const findings = [
        { finding_type: 'best_practice', title: 'General suggestion', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('investigation');
    });

    it('should handle empty findings array', () => {
      const result = mapFindingsToModules([]);
      expect(result).toContain('investigation');
    });
  });

  describe('multiple findings', () => {
    it('should aggregate modules from multiple findings', () => {
      const findings = [
        { finding_type: 'missing_info', title: '背景信息缺失', description: '' },
        { finding_type: 'logic_flaw', title: '风险评估不准确', description: '' },
        { finding_type: 'compliance_risk', title: 'CAPA措施不足', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('background');
      expect(result).toContain('investigation');
      expect(result).toContain('conclusion');
      expect(result).toContain('riskAssessment');
      expect(result).toContain('capa');
    });

    it('should deduplicate modules', () => {
      const findings = [
        { finding_type: 'logic_flaw', title: '调查逻辑问题', description: '' },
        { finding_type: 'logic_flaw', title: '结论逻辑问题', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      const investigationCount = result.filter(m => m === 'investigation').length;
      const conclusionCount = result.filter(m => m === 'conclusion').length;
      expect(investigationCount).toBe(1);
      expect(conclusionCount).toBe(1);
    });
  });

  describe('case insensitivity', () => {
    it('should match keywords case-insensitively', () => {
      const findings = [
        { finding_type: 'info', title: 'BACKGROUND issue', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('background');
    });
  });

  describe('English keywords', () => {
    it('should match English keywords', () => {
      const findings = [
        { finding_type: 'info', title: 'Investigation root cause analysis', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('investigation');
    });

    it('should match 5M1E keyword', () => {
      const findings = [
        { finding_type: 'info', title: '5M1E analysis incomplete', description: '' },
      ];
      const result = mapFindingsToModules(findings);
      expect(result).toContain('investigation');
    });
  });
});
