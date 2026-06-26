/**
 * AuditProgress - Shows real-time progress during an AuditBee audit.
 * Displays stage indicator, progress bar, and current status message.
 */

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { AuditStage } from '../../hooks/useAuditBee';
import { cn } from '../../lib/utils';

interface AuditProgressProps {
  stage: AuditStage;
  progress: number;
  error: string | null;
  onRetry?: () => void;
}

const STAGE_LABELS: Record<AuditStage, string> = {
  idle: '准备中',
  uploading: '上传报告到 AuditBee',
  creating: '创建审计任务',
  running: '正在执行合规性审计',
  completed: '审计完成',
  failed: '审计失败',
};

export function AuditProgress({ stage, progress, error, onRetry }: AuditProgressProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.from(ref.current, {
      y: 8,
      opacity: 0,
      duration: 0.3,
      ease: 'power3.out',
    });
  }, []);

  const isActive = stage === 'uploading' || stage === 'creating' || stage === 'running';
  const isCompleted = stage === 'completed';
  const isFailed = stage === 'failed';

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border p-4',
        isFailed
          ? 'border-red-200 bg-red-50'
          : isCompleted
            ? 'border-teal-200 bg-teal-50'
            : 'border-stone-200 bg-white',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        {isActive && (
          <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
        )}
        {isCompleted && (
          <CheckCircle2 className="w-5 h-5 text-teal-600" />
        )}
        {isFailed && (
          <AlertCircle className="w-5 h-5 text-red-500" />
        )}
        <span className="text-sm font-medium text-stone-800">
          {STAGE_LABELS[stage]}
        </span>
      </div>

      {/* Progress bar (only for active stages) */}
      {isActive && (
        <div className="w-full bg-stone-100 rounded-full h-2 mb-2">
          <div
            className="bg-teal-500 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progress, 5)}%` }}
          />
        </div>
      )}

      {/* Progress percentage */}
      {isActive && progress > 0 && (
        <p className="text-xs text-stone-400 text-right">{progress}%</p>
      )}

      {/* Error message */}
      {isFailed && error && (
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-red-600">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              重试
            </button>
          )}
        </div>
      )}
    </div>
  );
}
