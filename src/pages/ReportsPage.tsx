/**
 * 偏差报告页面
 * 使用统一的 UI 组件库
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Eye, Download, Trash2, Search, X, CheckSquare, Square, Package, Filter } from 'lucide-react';
import { reportApi, type ReportSummary } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { useToast } from '@/providers/ToastProvider';
import { DocumentViewer } from '@/components/document/DocumentViewer';
import { useDebounce } from '@/hooks/useDebounce';
import { createLogger } from '@core/utils/logger';
import type { DeviationReport } from '@core/workflow/types';

const log = createLogger('ReportsPage');

// Deviation type filters
const DEVIATION_TYPES = [
  { value: 'all', label: '全部类型' },
  { value: 'deviation_analysis', label: '偏差分析' },
  { value: 'capa', label: 'CAPA' },
  { value: 'investigation', label: '调查报告' },
];

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
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [viewingReport, setViewingReport] = useState<DeviationReport | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchExporting, setBatchExporting] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [viewExporting, setViewExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { success, error: showError } = useToast();

  const loadReports = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    reportApi.list()
      .then((list) => {
        setReports(list);
      })
      .catch((err) => {
        log.error('Failed to load reports', { error: String(err) });
        setLoadError(err instanceof Error ? err.message : '报告列表加载失败');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('确认删除此报告？')) return;
    setDeletingId(id);
    try {
      await reportApi.delete(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      success('报告已删除');
    } catch (err) {
      showError(`删除失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setDeletingId(null);
    }
  };

  // 列表项不含 content 大字段——查看/导出时按 id 拉取全文
  const loadFullReport = useCallback(
    async (summary: Pick<ReportSummary, 'id'>): Promise<DeviationReport | null> => {
      try {
        const full = await reportApi.get(summary.id);
        if (!full) {
          showError('报告不存在或已被删除');
          return null;
        }
        return JSON.parse(full.content) as DeviationReport;
      } catch {
        showError('报告数据解析失败');
        return null;
      }
    },
    [showError],
  );

  const handleView = async (report: ReportSummary) => {
    const parsed = await loadFullReport(report);
    if (parsed) {
      setViewingReport(parsed);
    }
  };

  const handleDownload = async (report: ReportSummary) => {
    const parsed = await loadFullReport(report);
    if (!parsed) return;

    setDownloadingId(report.id);
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
    } finally {
      setDownloadingId(null);
    }
  };

  // Export the report currently shown in the preview modal (already a DeviationReport)
  const handleExportViewing = async () => {
    if (!viewingReport) return;
    setViewExporting(true);
    try {
      if (typeof window === 'undefined' || !window.gmpilot) {
        showError('请在 Electron 环境中运行');
        return;
      }
      const result = await window.gmpilot.file.exportPdf(viewingReport);
      if (result.success) {
        success(`PDF 已导出: ${result.filePath}`);
      } else if (result.error) {
        showError(`导出失败: ${result.error}`);
      }
    } catch (err) {
      showError(`导出失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setViewExporting(false);
    }
  };

  const filteredReports = useMemo(() =>
    reports.filter((report) => {
      const matchesSearch = report.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (report.deviation_id || '').toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesType = typeFilter === 'all' || report.deviation_type === typeFilter;
      return matchesSearch && matchesType;
    }), [reports, debouncedSearch, typeFilter]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredReports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReports.map(r => r.id)));
    }
  }, [filteredReports, selectedIds.size]);

  const handleSelectOne = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBatchExport = async () => {
    if (selectedIds.size === 0) return;

    setBatchExporting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const id of selectedIds) {
        const report = reports.find(r => r.id === id);
        if (!report) continue;

        try {
          const parsed = await loadFullReport(report);
          if (!parsed) { failCount++; continue; }
          const result = await window.gmpilot.file.exportPdf(parsed);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (failCount === 0) {
        success(`已导出 ${successCount} 份报告`);
      } else {
        showError(`导出完成: ${successCount} 成功, ${failCount} 失败`);
      }
      setSelectedIds(new Set());
    } catch (err) {
      showError(`批量导出失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setBatchExporting(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.size} 份报告？`)) return;

    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        await reportApi.delete(id);
        successCount++;
      } catch {
        failCount++;
      }
    }

    if (failCount === 0) {
      success(`已删除 ${successCount} 份报告`);
      setReports(prev => prev.filter(r => !selectedIds.has(r.id)));
    } else {
      showError(`删除完成: ${successCount} 成功, ${failCount} 失败`);
      setReports(prev => prev.filter(r => !selectedIds.has(r.id)));
    }
    setSelectedIds(new Set());
  };

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
          <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
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
              <DocumentViewer report={viewingReport} onExportPdf={handleExportViewing} exporting={viewExporting} />
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white px-6 py-5 border-b border-stone-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-stone-900 font-display">
              偏差报告
            </h1>
            <p className="text-sm text-stone-500 mt-0.5">查看和管理所有偏差报告</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Type filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-stone-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-sm border border-stone-200 rounded-md px-2 py-1.5 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              >
                {DEVIATION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索报告..."
              className="w-64 bg-stone-50 focus:bg-white"
              prefix={<Search className="w-4 h-4" strokeWidth={1.5} />}
            />
          </div>
        </div>

        {/* Batch actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mt-4 p-3 bg-teal-50 rounded-lg border border-teal-100">
            <span className="text-sm text-teal-700 font-medium">
              已选择 {selectedIds.size} 份报告
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBatchExport}
                disabled={batchExporting}
                className="gap-1.5"
              >
                <Package className="w-3.5 h-3.5" />
                {batchExporting ? '导出中...' : '批量导出'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleBatchDelete}
                className="gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                批量删除
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                取消选择
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-lg border border-stone-100 overflow-hidden">
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
          ) : loadError ? (
            <ErrorState title="报告列表加载失败" description={loadError} onRetry={loadReports} />
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-stone-400">
              <FileText className="w-10 h-10 mb-3 stroke-1" />
              <p className="text-sm font-medium">
                {search ? '未找到匹配的报告' : '暂无报告'}
              </p>
              <p className="text-xs mt-1">
                {search ? '尝试其他搜索词' : '生成偏差报告后将在此处显示'}
              </p>
              {!search && (
                <button
                  onClick={() => navigate('/')}
                  className="mt-3 px-4 py-1.5 text-[12px] font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors border border-teal-100"
                >
                  创建报告
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center"
                    >
                      {selectedIds.size === filteredReports.length && filteredReports.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-teal-600" />
                      ) : (
                        <Square className="w-4 h-4 text-stone-400" />
                      )}
                    </button>
                  </th>
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
                      <button
                        onClick={() => handleSelectOne(report.id)}
                        className="flex items-center"
                      >
                        {selectedIds.has(report.id) ? (
                          <CheckSquare className="w-4 h-4 text-teal-600" />
                        ) : (
                          <Square className="w-4 h-4 text-stone-400" />
                        )}
                      </button>
                    </td>
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
                          disabled={downloadingId === report.id}
                          title="下载"
                        >
                          {downloadingId === report.id ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" strokeWidth={1.5} />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(report.id)}
                          disabled={deletingId === report.id}
                          title="删除"
                          className="hover:text-red-600 hover:bg-red-50"
                        >
                          {deletingId === report.id ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                          )}
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
