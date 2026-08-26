/**
 * 知识库页面
 * 使用统一的 UI 组件库
 * 支持文件名过滤和语义搜索
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { BookOpen, Upload, Trash2, FileText, Search, Sparkles, BarChart3 } from 'lucide-react';
import { knowledgeApi, type KnowledgeDoc } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { useToast } from '@/providers/ToastProvider';
import { useDebounce } from '@/hooks/useDebounce';
import { createLogger } from '@core/utils/logger';

const log = createLogger('KnowledgePage');

interface SearchResult {
  content: string;
  sectionPath: string;
  similarity: number;
  docId: number;
  chunkIndex: number;
}

export function KnowledgePage() {
  const { success, error: showError, warning } = useToast();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [searchMode, setSearchMode] = useState<'filename' | 'semantic'>('filename');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<{ docCount: number; chunkCount: number } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [indexProgress, setIndexProgress] = useState<{ indexing: boolean; total: number; done: number; currentFile: string | null } | null>(null);

  const loadDocuments = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    knowledgeApi.listDocuments()
      .then(setDocs)
      .catch((err) => {
        log.error('Failed to load documents', { error: String(err) });
        setLoadError(err instanceof Error ? err.message : '文档列表加载失败');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDocuments();
    // 加载统计信息
    if (window.gmpilot) {
      window.gmpilot.knowledge.stats().then(setStats).catch((err) => log.error('Failed to load stats', { error: String(err) }));
    }
    // 订阅索引进度推送（内置库首启索引约需 1 小时，必须让用户看到进度）
    let unsubscribe: (() => void) | undefined;
    if (window.gmpilot) {
      unsubscribe = window.gmpilot.knowledge.onIndexingProgress((data: unknown) => {
        const p = data as { indexing: boolean; total: number; done: number; currentFile: string | null };
        setIndexProgress(p);
        if (!p.indexing) {
          // 索引完成：刷新列表和统计
          loadDocuments();
          window.gmpilot?.knowledge.stats().then(setStats).catch(() => {});
        }
      });
    }
    return () => unsubscribe?.();
  }, [loadDocuments]);

  const handleUpload = async (category?: string) => {
    if (!window.gmpilot) {
      warning('请在 Electron 环境中运行');
      return;
    }
    setUploading(true);
    try {
      const uploadCategory = category || (categoryFilter !== 'all' ? categoryFilter : 'regulation');
      const result = await window.gmpilot.knowledge.pickAndAdd(uploadCategory);
      if (result.success) {
        success(`已上传：${result.filename}`);
        knowledgeApi.listDocuments().then(setDocs).catch((err) => log.error('Failed to reload documents', { error: String(err) }));
        // 刷新统计信息
        window.gmpilot.knowledge.stats().then(setStats).catch((err) => log.error('Failed to reload stats', { error: String(err) }));
      } else if (result.error) {
        showError(result.error);
      }
    } catch (err) {
      showError(`上传失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: number) => {
    if (!window.confirm('确认删除此文档？')) return;
    setDeletingId(docId);
    try {
      await knowledgeApi.deleteDocument(docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      success('已删除');
      // 刷新统计信息
      if (window.gmpilot) {
        window.gmpilot.knowledge.stats().then(setStats).catch((err) => log.error('Failed to refresh stats', { error: String(err) }));
      }
    } catch (err) {
      showError(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  // 语义搜索
  const handleSemanticSearch = useCallback(async (query: string) => {
    if (!query.trim() || !window.gmpilot) return;

    setSearching(true);
    try {
      const results = await knowledgeApi.query(query);
      setSearchResults(results as SearchResult[]);
    } catch (err) {
      showError(`搜索失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSearching(false);
    }
  }, [showError]);

  // 搜索模式切换
  const handleSearchModeChange = (mode: 'filename' | 'semantic') => {
    setSearchMode(mode);
    setSearchResults([]);
    setSearch('');
  };

  const filteredDocs = useMemo(() =>
    docs.filter((doc) => {
      const matchesSearch = doc.filename.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
      return matchesSearch && matchesCategory;
    }), [docs, debouncedSearch, categoryFilter]);

  const CATEGORY_LABELS: Record<string, string> = {
    all: '全部',
    sop: 'SOP',
    deviation: '历史偏差',
    regulation: '法规',
    'GMP第一部分': 'GMP第一部分',
    'GMP第二部分': 'GMP第二部分',
    'GMP第三部分': 'GMP第三部分',
    'GMP附件': 'GMP附件',
    'EU法规': 'EU法规',
  };

  const SOURCE_LABELS: Record<string, { label: string; variant: 'teal' | 'stone' | 'amber' }> = {
    builtin: { label: '内置', variant: 'teal' },
    user: { label: '用户', variant: 'stone' },
    gmp_regulation: { label: 'GMP法规', variant: 'amber' },
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="bg-white px-6 py-5 border-b border-stone-100 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-900 font-display">
            知识库
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">管理法规文档和内部文档</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 统计信息 */}
          {stats && (
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{stats.docCount} 文档</span>
              <span>·</span>
              <span>{stats.chunkCount} 分块</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => handleUpload('sop')} disabled={uploading}>
              {uploading ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : null}
              上传SOP
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleUpload('deviation')} disabled={uploading}>
              {uploading ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : null}
              上传偏差
            </Button>
            <Button onClick={() => handleUpload('regulation')} disabled={uploading}>
              {uploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4" strokeWidth={2} />
              )}
              上传法规
            </Button>
          </div>
        </div>
      </div>

      {/* Search + Category Filter */}
      <div className="bg-white px-6 py-4 border-b border-stone-100">
        {/* 内置库索引进度条（首启索引 55 个文件约需 1 小时，必须可视化） */}
        {indexProgress?.indexing && (
          <div className="mb-4 p-3 bg-teal-50 border border-teal-100 rounded-lg">
            <div className="flex items-center justify-between text-xs text-teal-800 mb-1.5">
              <span className="font-medium">
                正在构建知识库索引：{indexProgress.done}/{indexProgress.total}
              </span>
              <span className="text-teal-600">
                {indexProgress.total > 0 ? Math.round((indexProgress.done / indexProgress.total) * 100) : 0}%
              </span>
            </div>
            <div className="h-1.5 bg-teal-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${indexProgress.total > 0 ? (indexProgress.done / indexProgress.total) * 100 : 0}%` }}
              />
            </div>
            {indexProgress.currentFile && (
              <p className="text-[11px] text-teal-700/70 mt-1.5 truncate font-mono">
                {indexProgress.currentFile}
              </p>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          {/* 分类过滤 */}
          <div className="flex items-center bg-stone-100 rounded-lg p-0.5 flex-wrap gap-0.5">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
              // 动态分类：只显示实际存在的分类
              if (key !== 'all' && !docs.some(d => d.category === key)) return null;
              return (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    categoryFilter === key
                      ? 'bg-white text-stone-800 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {/* 搜索模式切换 */}
          <div className="flex items-center bg-stone-100 rounded-lg p-0.5">
            <button
              onClick={() => handleSearchModeChange('filename')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                searchMode === 'filename'
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              文件名
            </button>
            <button
              onClick={() => handleSearchModeChange('semantic')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                searchMode === 'semantic'
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              语义搜索
            </button>
          </div>

          {/* 搜索输入框 */}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchMode === 'semantic') {
                handleSemanticSearch(search);
              }
            }}
            placeholder={searchMode === 'filename' ? '按文件名搜索...' : '输入语义搜索内容，如：GMP 质量管理'}
            className="flex-1 bg-stone-50 focus:bg-white"
            prefix={<Search className="w-4 h-4" strokeWidth={1.5} />}
          />

          {/* 语义搜索按钮 */}
          {searchMode === 'semantic' && (
            <Button
              onClick={() => handleSemanticSearch(search)}
              disabled={!search.trim() || searching}
              size="sm"
            >
              {searching ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              搜索
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* 语义搜索结果 */}
        {searchMode === 'semantic' && searchResults.length > 0 && (
          <div className="bg-white rounded-lg border border-stone-100 overflow-hidden mb-6">
            <div className="px-5 py-3 bg-teal-50 border-b border-teal-100">
              <h3 className="text-sm font-semibold text-teal-800">搜索结果</h3>
              <p className="text-xs text-teal-600 mt-0.5">找到 {searchResults.length} 个相关片段</p>
            </div>
            <div className="divide-y divide-stone-100">
              {searchResults.map((result, index) => (
                <div key={index} className="px-5 py-4 hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="teal" className="text-xs">
                      相似度: {(result.similarity * 100).toFixed(1)}%
                    </Badge>
                    <span className="text-xs text-stone-500">{result.sectionPath}</span>
                  </div>
                  <p className="text-sm text-stone-700 leading-relaxed line-clamp-3">
                    {result.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 语义搜索无结果 */}
        {searchMode === 'semantic' && search && !searching && searchResults.length === 0 && (
          <div className="bg-white rounded-lg border border-stone-100 overflow-hidden mb-6">
            <div className="flex flex-col items-center justify-center h-32 text-stone-400">
              <Sparkles className="w-8 h-8 mb-2 stroke-1" />
              <p className="text-sm font-medium">未找到相关内容</p>
              <p className="text-xs mt-1">尝试其他搜索词</p>
            </div>
          </div>
        )}

        {/* 文档列表 */}
        <div className="bg-white rounded-lg border border-stone-100 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <ErrorState title="文档列表加载失败" description={loadError} onRetry={loadDocuments} />
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-stone-400">
              <BookOpen className="w-10 h-10 mb-3 stroke-1" />
              <p className="text-sm font-medium">
                {search ? '未找到匹配的文档' : '暂无文档'}
              </p>
              <p className="text-xs mt-1">
                {search ? '尝试其他搜索词' : '上传法规文档以构建知识库'}
              </p>
              {!search && (
                <button
                  onClick={() => handleUpload('regulation')}
                  disabled={uploading}
                  className="mt-3 px-4 py-1.5 text-[12px] font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors border border-teal-100"
                >
                  上传法规文档
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">文件名</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">来源</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">分类</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">分块数</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc, index) => (
                  <tr key={doc.id} className={`border-b border-stone-50 hover:bg-stone-50 transition-colors ${index % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-teal-600" strokeWidth={1.5} />
                        </div>
                        <span className="text-sm text-stone-800">{doc.filename}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={(SOURCE_LABELS[doc.source] || SOURCE_LABELS.user).variant}>
                        {(SOURCE_LABELS[doc.source] || SOURCE_LABELS.user).label}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={doc.category === 'sop' ? 'teal' : doc.category === 'deviation' ? 'amber' : 'stone'}>
                        {CATEGORY_LABELS[doc.category] || doc.category}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-sm text-stone-600 font-mono">{doc.chunk_count}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end">
                        {doc.source === 'user' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                            title="删除"
                          >
                            {deletingId === doc.id ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                            )}
                          </Button>
                        )}
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
