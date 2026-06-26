/**
 * Document viewer component.
 * Modern, clean design for viewing generated deviation reports.
 */

import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import {
  ChevronRight,
  FileText,
  Copy,
  Download,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Loader2,
} from 'lucide-react';
import type { DeviationReport } from '@core/workflow/types';
import type { AuditBeeFinding } from '@core/integration/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuditFindingsSummary } from '@/components/audit/AuditFindingsSummary';

interface DocumentViewerProps {
  report: DeviationReport | null;
  onExportPdf?: () => void;
  onSendToAudit?: () => void;
  /** Audit state from useAuditBee hook */
  auditLoading?: boolean;
  auditFindings?: AuditBeeFinding[] | null;
  auditAvailable?: boolean | null;
  onViewAuditDetails?: () => void;
}

function ReportSection({
  title,
  icon: Icon,
  content,
  defaultOpen = false,
  accentColor = 'teal',
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  content: string;
  defaultOpen?: boolean;
  accentColor?: 'teal' | 'amber' | 'stone';
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const contentAnimRef = useRef<gsap.core.Tween | null>(null);
  const iconAnimRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (contentRef.current && isOpen) {
      contentAnimRef.current = gsap.from(contentRef.current, {
        height: 0,
        opacity: 0,
        duration: 0.3,
        ease: 'power2.inOut',
      });
    }
    return () => {
      contentAnimRef.current?.kill();
    };
  }, [isOpen]);

  useEffect(() => {
    if (iconRef.current) {
      iconAnimRef.current = gsap.to(iconRef.current, {
        rotation: isOpen ? 90 : 0,
        duration: 0.2,
        ease: 'power2.out',
      });
    }
    return () => {
      iconAnimRef.current?.kill();
    };
  }, [isOpen]);

  const accentClasses = {
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    stone: 'bg-stone-50 text-stone-600 border-stone-100',
  };

  return (
    <div className="border-b border-stone-100 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 w-full px-5 py-3.5 text-left hover:bg-stone-50/50 transition-colors"
      >
        <div
          className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${accentClasses[accentColor]}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="flex-1 text-sm font-medium text-stone-800">
          {title}
        </span>
        <ChevronRight
          ref={iconRef}
          className="w-3.5 h-3.5 text-stone-400 flex-shrink-0"
          strokeWidth={2}
        />
      </button>
      {isOpen && (
        <div ref={contentRef} className="px-5 pb-4 overflow-hidden">
          <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap pl-10">
            {content || '暂无内容'}
          </p>
        </div>
      )}
    </div>
  );
}

export function DocumentViewer({
  report,
  onExportPdf,
  onSendToAudit,
  auditLoading,
  auditFindings,
  auditAvailable,
  onViewAuditDetails,
}: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerAnimRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (report && containerRef.current) {
      containerAnimRef.current = gsap.from(containerRef.current, {
        x: 20,
        opacity: 0,
        duration: 0.4,
        ease: 'power3.out',
      });
    }
    return () => {
      containerAnimRef.current?.kill();
    };
  }, [report]);

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-14 h-14 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-center mb-4">
          <FileText
            className="w-6 h-6 text-stone-300"
            strokeWidth={1.5}
          />
        </div>
        <p className="text-sm text-stone-500 font-medium mb-1">
          暂无报告
        </p>
        <p className="text-xs text-stone-400">
          生成报告后将在此处显示
        </p>
      </div>
    );
  }

  const riskConfig = {
    high: { variant: 'red' as const, label: '高风险' },
    medium: { variant: 'amber' as const, label: '中风险' },
    low: { variant: 'teal' as const, label: '低风险' },
  };
  const riskLevel = report.riskLevel || 'low';
  const risk = riskConfig[riskLevel as keyof typeof riskConfig] || riskConfig.low;

  const sections = [
    {
      title: '偏差背景',
      icon: FileText,
      content: report.cover?.title || report.background?.description || '',
      accent: 'teal' as const,
    },
    {
      title: '调查分析',
      icon: FlaskConical,
      content: report.investigation?.rootCause?.conclusion || '',
      accent: 'teal' as const,
    },
    {
      title: '风险评估',
      icon: AlertTriangle,
      content: [
        `风险等级：${risk.label}`,
        `风险评分：${report.riskScore ?? '-'}`,
        `质量影响：${report.riskAssessment?.qualityImpact || '-'}`,
        `稳定性影响：${report.riskAssessment?.stabilityImpact || '-'}`,
        `注册影响：${report.riskAssessment?.registrationImpact || '-'}`,
      ]
        .filter(Boolean)
        .join('\n'),
      accent: 'amber' as const,
    },
    {
      title: 'CAPA 措施',
      icon: Shield,
      content:
        report.capa?.corrections
          ?.map((c) => `• ${c.content}`)
          .join('\n') || '',
      accent: 'stone' as const,
    },
    {
      title: '结论',
      icon: CheckCircle2,
      content: report.conclusion?.rootCause || '',
      accent: 'teal' as const,
    },
  ];

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
              <FlaskConical
                className="w-4 h-4 text-teal-600"
                strokeWidth={1.5}
              />
            </div>
            <div>
              <span className="text-sm font-semibold text-stone-900">
                {report.deviationId || '偏差报告'}
              </span>
              <p className="text-[11px] text-stone-400 tracking-wide">
                偏差调查报告
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const text = JSON.stringify(report, null, 2);
                navigator.clipboard.writeText(text);
              }}
              title="复制"
            >
              <Copy className="w-4 h-4" strokeWidth={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onExportPdf}
              title="导出 PDF"
            >
              <Download className="w-4 h-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={risk.variant}>
            {riskLevel === 'high' && (
              <AlertTriangle className="w-3 h-3" strokeWidth={2} />
            )}
            {risk.label}
          </Badge>

          {onSendToAudit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onSendToAudit}
              disabled={auditLoading}
              className="ml-auto"
            >
              {auditLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  审计中
                </>
              ) : (
                '发送审计'
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Audit summary */}
      {(auditFindings !== undefined || auditLoading) && (
        <div className="px-5 py-3 border-b border-stone-100">
          <AuditFindingsSummary
            findings={auditFindings ?? null}
            loading={auditLoading ?? false}
            isAvailable={auditAvailable ?? null}
            onViewDetails={onViewAuditDetails}
            onSendToAudit={onSendToAudit}
          />
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section, index) => (
          <ReportSection
            key={index}
            title={section.title}
            icon={section.icon}
            content={section.content}
            accentColor={section.accent}
            defaultOpen={index === 0}
          />
        ))}
      </div>
    </div>
  );
}
