/**
 * AuditBeeStatus - Built-in audit status indicator.
 * Audit is now fully integrated into the workflow (no external service needed).
 */

import { CheckCircle2 } from 'lucide-react';

interface AuditBeeStatusProps {
  /** Show full settings form (for Settings page) */
  showSettings?: boolean;
}

export function AuditBeeStatus({ showSettings = false }: AuditBeeStatusProps) {
  // Compact status indicator (for Sidebar)
  if (!showSettings) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-teal-500" />
        <span className="text-xs text-stone-400">内置审核已启用</span>
      </div>
    );
  }

  // Full settings form (for Settings page)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-teal-600" />
        <div>
          <p className="text-sm font-medium text-stone-800">内置审核引擎</p>
          <p className="text-xs text-stone-400">
            报告生成后自动执行合规性审核，无需外部服务
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-teal-50 border-teal-200">
        <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
        <span className="text-sm text-stone-600">
          审核功能已集成到工作流中，生成报告后将自动审核
        </span>
      </div>
    </div>
  );
}
