/**
 * 偏差报告页面
 * 使用统一的 UI 组件库
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Eye, Download, Trash2, Search, X } from 'lucide-react';
import { reportApi, type Report } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from '@/providers/ToastProvider';
import { DocumentViewer } from '@/components/document/DocumentViewer';
import type { DeviationReport } from '@core/workflow/types';

const riskConfig = {
  high: { variant: 'red' as const, label: '高风险' },
  medium: { variant: 'amber' as const, label: '中风险' },
  low: { variant: 'teal' as const, label: '低风险' },
};

function RiskBadge({ level }: { level: string }) {
  const config = riskConfig[level as keyof typeof riskConfig] || riskConfig.low;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingReport, setViewingReport] = useState<DeviationReport | null>(null);
  const { success, error: showError } = useToast();

  useEffect(() => {
    reportApi.list().then(setReports).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm('确认删除此报告？')) return;
    try {
      await reportApi.delete(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      success('报告已删除');
    } catch (err) {
      showError(`删除失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const parseReportContent = useCallback((report: Report): DeviationReport | null => {
    try {
      return JSON.parse(report.content) as DeviationReport;
    } catch {
      showError('报告数据解析失败');
      return null;
    }
  }, [showError]);

  const handleView = (report: Report) => {
    const parsed = parseReportContent(report);
    if (parsed) {
      setViewingReport(parsed);
    }
  };

  const handleDownload = async (report: Report) => {
    const parsed = parseReportContent(report);
    if (!parsed) return;

    try {
      if (typeof window === 'undefined' || !window.gmpilot) {
        showError('请在 Electron 环境中运行');
        return;
      }
      const result = await window.gmpilot.file.exportPdf(parsed);
      if (result.success) {
        success(`PDF 已导出: ${result.filePath}`);
      } else if (result.error) {
        showError(`导出失败: ${result.error}`);
      }
    } catch (err) {
      showError(`导出失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const filteredReports = useMemo(() =>
    reports.filter((report) =>
      report.title.toLowerCase().includes(search.toLowerCase()) ||
      (report.deviation_id || '').toLowerCase().includes(search.toLowerCase())
    ), [reports, search]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Report detail dialog */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-overlay" onClick={() => setViewingReport(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
              <h2 className="text-sm font-semibold text-stone-900">报告详情</h2>
              <button
                onClick={() => setViewingReport(null)}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DocumentViewer report={viewingReport} />
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white px-6 py-5 border-b border-stone-100 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-900 font-display">
            偏差报告
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">查看和管理所有偏差报告</p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索报告..."
          className="w-64 bg-stone-50 focus:bg-white"
          prefix={<Search className="w-4 h-4" strokeWidth={1.5} />}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-stone-400">
              <FileText className="w-10 h-10 mb-3 stroke-1" />
              <p className="text-sm font-medium">
                {search ? '未找到匹配的报告' : '暂无报告'}
              </p>
              <p className="text-xs mt-1">
                {search ? '尝试其他搜索词' : '生成偏差报告后将在此处显示'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">编号</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">标题</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">风险等级</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">创建时间</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report, index) => (
                  <tr key={report.id} className={`border-b border-stone-50 hover:bg-stone-50 transition-colors ${index % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                    <td className="px-5 py-4">
                      <Badge variant="teal" className="font-mono">
                        {report.deviation_id || `DEV-${report.id}`}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-sm text-stone-800">{report.title}</td>
                    <td className="px-5 py-4">
                      <RiskBadge level={report.risk_level} />
                    </td>
                    <td className="px-5 py-4 text-xs text-stone-500 font-mono tracking-wide">
                      {formatDate(report.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleView(report)}
                          title="查看"
                        >
                          <Eye className="w-4 h-4" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(report)}
                          title="下载"
                        >
                          <Download className="w-4 h-4" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(report.id)}
                          title="删除"
                          className="hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
