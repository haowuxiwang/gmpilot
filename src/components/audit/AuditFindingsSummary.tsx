/**
 * AuditFindingsSummary - Compact summary of audit results.
 * Embedded in DocumentViewer to show audit status at a glance.
 */

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { CheckCircle2, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '../ui';
import type { AuditBeeFinding } from '../../../core/integration/types';
import { cn } from '../../lib/utils';

interface AuditFindingsSummaryProps {
  findings: AuditBeeFinding[] | null;
  loading: boolean;
  onViewDetails?: () => void;
  onSendToAudit?: () => void;
  isAvailable: boolean | null;
}

export function AuditFindingsSummary({
  findings,
  loading,
  onViewDetails,
  onSendToAudit: _onSendToAudit,
  isAvailable,
}: AuditFindingsSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !findings) return;
    gsap.from(ref.current, {
      y: -8,
      opacity: 0,
      duration: 0.3,
      ease: 'power3.out',
    });
  }, [findings]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 rounded-xl border border-stone-200">
        <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
        <span className="text-sm text-stone-600">正在审计...</span>
      </div>
    );
  }

  // No findings yet
  if (!findings) {
    // Show audit button if AuditBee is available
    if (isAvailable === false) {
      return (
        <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 rounded-xl border border-stone-200">
          <span className="text-xs text-stone-400">AuditBee 服务未启动，无法审计</span>
        </div>
      );
    }

    return null;
  }

  // Compute severity counts
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const totalCount = findings.length;

  // All clear
  if (totalCount === 0 || highCount === 0) {
    return (
      <div
        ref={ref}
        className="flex items-center justify-between px-4 py-3 bg-teal-50 rounded-xl border border-teal-200"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600" />
          <span className="text-sm text-teal-700 font-medium">审计通过</span>
          <span className="text-xs text-teal-600">未发现高风险问题</span>
        </div>
        {onViewDetails && totalCount > 0 && (
          <button
            onClick={onViewDetails}
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700"
          >
            查看详情
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  // Has issues
  return (
    <div
      ref={ref}
      className="flex items-center justify-between px-4 py-3 bg-red-50 rounded-xl border border-red-200"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="text-sm text-red-700 font-medium">审计发现</span>
        <Badge variant="red" className="text-[10px]">{highCount} 高风险</Badge>
        {totalCount > highCount && (
          <span className="text-xs text-red-600">
            共 {totalCount} 个问题
          </span>
        )}
      </div>
      {onViewDetails && (
        <button
          onClick={onViewDetails}
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            'text-red-600 hover:text-red-700',
          )}
        >
          查看详情
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
