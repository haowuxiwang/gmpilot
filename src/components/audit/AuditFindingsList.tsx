/**
 * AuditFindingsList - Displays audit findings from AuditBee.
 * Shows findings sorted by severity with expandable details.
 */

import { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ChevronDown, AlertTriangle, AlertCircle, Info, FileText, Pencil } from 'lucide-react';
import { Badge, Button } from '../ui';
import type { AuditBeeFinding } from '../../../core/integration/types';
import { cn } from '../../lib/utils';

interface AuditFindingsListProps {
  findings: AuditBeeFinding[];
  onRevise?: () => void;
  onExport?: () => void;
}

const SEVERITY_ORDER: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const SEVERITY_CONFIG = {
  high: {
    icon: AlertTriangle,
    badge: 'red' as const,
    label: '高风险',
    bgClass: 'bg-red-50 border-red-200',
    iconClass: 'text-red-500',
  },
  medium: {
    icon: AlertCircle,
    badge: 'amber' as const,
    label: '中风险',
    bgClass: 'bg-amber-50 border-amber-200',
    iconClass: 'text-amber-500',
  },
  low: {
    icon: Info,
    badge: 'teal' as const,
    label: '低风险',
    bgClass: 'bg-teal-50 border-teal-200',
    iconClass: 'text-teal-500',
  },
  info: {
    icon: Info,
    badge: 'stone' as const,
    label: '信息',
    bgClass: 'bg-stone-50 border-stone-200',
    iconClass: 'text-stone-400',
  },
};

function FindingCard({ finding }: { finding: AuditBeeFinding }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const config = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info;
  const Icon = config.icon;

  useEffect(() => {
    if (!contentRef.current) return;
    if (expanded) {
      gsap.from(contentRef.current, {
        height: 0,
        opacity: 0,
        duration: 0.25,
        ease: 'power2.out',
      });
    }
  }, [expanded]);

  return (
    <div className={cn('rounded-xl border p-4', config.bgClass)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 text-left"
      >
        <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', config.iconClass)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={config.badge} className="text-[10px]">
              {config.label}
            </Badge>
            {finding.finding_type && (
              <span className="text-[10px] text-stone-400 font-mono">
                {finding.finding_type}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-stone-800">{finding.title}</p>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-stone-400 transition-transform duration-200 shrink-0 mt-1',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div ref={contentRef} className="mt-3 pl-8 space-y-2">
          {finding.description && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1">描述</p>
              <p className="text-sm text-stone-700">{finding.description}</p>
            </div>
          )}
          {finding.evidence && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1">证据</p>
              <p className="text-sm text-stone-600 bg-white/60 rounded-lg p-2">
                {finding.evidence}
              </p>
            </div>
          )}
          {finding.suggestion && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1">改进建议</p>
              <p className="text-sm text-teal-700 bg-teal-50/60 rounded-lg p-2">
                {finding.suggestion}
              </p>
            </div>
          )}
          {finding.regulation_ref && (
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <FileText className="w-3 h-3" />
              <span>{finding.regulation_ref}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AuditFindingsList({ findings, onRevise, onExport }: AuditFindingsListProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.from(ref.current, {
      y: 12,
      opacity: 0,
      duration: 0.4,
      ease: 'power3.out',
    });
  }, []);

  // Sort by severity (high first)
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0),
  );

  // Count by severity
  const counts = findings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const hasHighRisk = (counts.high || 0) > 0;

  return (
    <div ref={ref} className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-stone-700">审计结果</span>
        {counts.high ? (
          <Badge variant="red" className="text-[10px]">{counts.high} 高风险</Badge>
        ) : null}
        {counts.medium ? (
          <Badge variant="amber" className="text-[10px]">{counts.medium} 中风险</Badge>
        ) : null}
        {counts.low ? (
          <Badge variant="teal" className="text-[10px]">{counts.low} 低风险</Badge>
        ) : null}
        {counts.info ? (
          <Badge variant="stone" className="text-[10px]">{counts.info} 信息</Badge>
        ) : null}
      </div>

      {/* Findings list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {sorted.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
        {hasHighRisk && onRevise && (
          <Button variant="primary" size="sm" onClick={onRevise}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            根据发现修订
          </Button>
        )}
        {onExport && (
          <Button variant="secondary" size="sm" onClick={onExport}>
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            导出审计报告
          </Button>
        )}
      </div>
    </div>
  );
}
