/**
 * Document viewer component.
 * Modern, clean design for viewing generated deviation reports.
 * 报告正文使用 Noto Serif CJK SC 衬线字体（与 PDF 导出保持一致）。
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  ChevronRight,
  FileText,
  Copy,
  Download,
  AlertTriangle,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import type { DeviationReport } from '@core/workflow/types';
import type { AuditFinding } from '@core/llm/caller';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuditFindingsSummary } from '@/components/audit/AuditFindingsSummary';
import { loadSerifFont } from '@/lib/fonts';

// 注册 Noto Serif CJK SC（与 PDF 模板共用同一字体文件）。
// 开发环境 http:// 页面加载 file:// 字体可能被 CORS 拦截 → 优雅降级为系统衬线。

interface DocumentViewerProps {
  report: DeviationReport | null;
  onExportPdf?: () => void;
  /** 导出 Word（模板填充） */
  onExportDocx?: () => void;
  /** True while a PDF export is in flight (shows loading on the export button) */
  exporting?: boolean;
  /** 当前正在导出的类型（pdf | docx），用于导出按钮 loading */
  exportingType?: 'pdf' | 'docx' | null;
  /** Audit results from built-in audit agent */
  auditFindings?: AuditFinding[] | null;
  auditScore?: number | null;
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
          data-open={isOpen}
          className="chevron-rotate w-3.5 h-3.5 text-stone-400 flex-shrink-0"
          strokeWidth={2}
        />
      </button>
      <div data-open={isOpen} className="collapse-grid">
        <div>
          <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap pl-10 pr-5 pb-4 font-serif">
            {content || '暂无内容'}
          </p>
        </div>
      </div>
    </div>
  );
}

export function DocumentViewer({
  report,
  onExportPdf,
  onExportDocx,
  exporting,
  exportingType,
  auditFindings,
  auditScore,
  onViewAuditDetails,
}: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSerifFont();
  }, []);

  // 报告入场：motion 替代 GSAP（x+20 fade, power3 等效 easeOut）

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 animate-fade-in">
        <div className="w-14 h-14 rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center mb-4 animate-glow">
          <FileText
            className="w-6 h-6 text-stone-300"
            strokeWidth={1.5}
          />
        </div>
        <p className="text-sm text-stone-500 font-medium mb-1">
          暂无报告
        </p>
        <p className="text-xs text-stone-400">
          在对话中描述偏差情况，AI 将自动生成报告
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
      icon: FileText,
      content: report.investigation?.rootCause?.conclusion || '',
      accent: 'teal' as const,
    },
    {
      title: '风险评估',
      icon: AlertTriangle,
      content: [
        `风险等级：${risk.label}`,
        `风险评分：${report.riskScore ?? '-'}`,
        ...(report.riskAssessment?.description || '')
          .split('\n')
          .filter(Boolean)
          .map((p) => `• ${p}`),
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
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col h-full"
    >
      {/* Header — 精简：无图标，纯文字层次 */}
      <div className="px-5 py-4 border-b border-stone-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-stone-900">
            {report.deviationId || '偏差报告'}
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const text = JSON.stringify(report, null, 2);
                navigator.clipboard.writeText(text).catch(() => {
                  console.error('Failed to copy report to clipboard');
                });
              }}
              title="复制"
            >
              <Copy className="w-4 h-4" strokeWidth={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onExportPdf}
              disabled={exporting || exportingType === 'pdf' || exportingType === 'docx'}
              title="导出 PDF"
            >
              {exporting || exportingType === 'pdf' ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" strokeWidth={1.5} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onExportDocx}
              disabled={exporting || exportingType === 'pdf' || exportingType === 'docx'}
              title="导出 Word（模板填充）"
            >
              {exportingType === 'docx' ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileText className="w-4 h-4" strokeWidth={1.5} />
              )}
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
          <span className="text-[11px] text-stone-400">
            风险评分 {report.riskScore ?? '-'}
          </span>
        </div>
      </div>

      {/* Audit summary */}
      {auditFindings !== undefined && (
        <div className="px-5 py-3 border-b border-stone-100">
          <AuditFindingsSummary
            findings={auditFindings ?? null}
            loading={false}
            overallScore={auditScore}
            onViewDetails={onViewAuditDetails}
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
    </motion.div>
  );
}
