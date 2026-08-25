/**
 * AuditFindingsSummary - Compact audit result summary shown in the document viewer.
 * Displays the overall score and a short summary of audit findings.
 */

import { Shield, ChevronRight } from 'lucide-react';
import type { AuditFinding } from '../../../core/llm/caller';

interface AuditFindingsSummaryProps {
  findings: AuditFinding[] | null;
  loading?: boolean;
  overallScore?: number | null;
  onViewDetails?: () => void;
}

function AuditFindingsSummary({ findings, loading = false, overallScore, onViewDetails }: AuditFindingsSummaryProps) {
  const count = findings?.length ?? 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 border border-teal-100">
        <Shield className="h-4 w-4 text-teal-600" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-stone-700">
          {loading
            ? '正在审核报告...'
            : count > 0
              ? `审核完成：${count} 条建议`
              : '审核完成：未发现问题'}
        </p>
        {!loading && overallScore !== undefined && overallScore !== null && (
          <p className="text-[11px] text-stone-400">综合评分 {overallScore}</p>
        )}
      </div>
      {count > 0 && onViewDetails && (
        <button
          type="button"
          onClick={onViewDetails}
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
        >
          查看详情
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export { AuditFindingsSummary };
