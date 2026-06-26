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
import { Input } from '@/components/ui/input';
import { useToast } from '@/providers/ToastProvider';

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
  const [searchMode, setSearchMode] = useState<'filename' | 'semantic'>('filename');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<{ docCount: number; chunkCount: number } | null>(null);

  useEffect(() => {
    knowledgeApi.listDocuments().then(setDocs).catch(console.error).finally(() => setLoading(false));
    // 加载统计信息
    if (window.gmpilot) {
      window.gmpilot.knowledge.stats().then(setStats).catch(console.error);
    }
  }, []);

  const handleUpload = async () => {
    if (!window.gmpilot) {
      warning('请在 Electron 环境中运行');
      return;
    }
    try {
      const result = await window.gmpilot.knowledge.pickAndAdd();
      if (result.success) {
        success(`已上传：${result.filename}`);
        knowledgeApi.listDocuments().then(setDocs).catch(console.error);
        // 刷新统计信息
        window.gmpilot.knowledge.stats().then(setStats).catch(console.error);
      } else if (result.error) {
        showError(result.error);
      }
    } catch (err) {
      showError(`上传失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (docId: number) => {
    if (!window.confirm('确认删除此文档？')) return;
    try {
      await knowledgeApi.deleteDocument(docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      success('已删除');
      // 刷新统计信息
      if (window.gmpilot) {
        window.gmpilot.knowledge.stats().then(setStats).catch(console.error);
      }
    } catch (err) {
      showError(`删除失败：${err instanceof Error ? err.message : String(err)}`);
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
    docs.filter((doc) =>
      doc.filename.toLowerCase().includes(search.toLowerCase())
    ), [docs, search]);

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
          <Button onClick={handleUpload}>
            <Upload className="w-4 h-4" strokeWidth={2} />
            上传文档
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white px-6 py-4 border-b border-stone-100">
        <div className="flex items-center gap-3">
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
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden mb-6">
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
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden mb-6">
            <div className="flex flex-col items-center justify-center h-32 text-stone-400">
              <Sparkles className="w-8 h-8 mb-2 stroke-1" />
              <p className="text-sm font-medium">未找到相关内容</p>
              <p className="text-xs mt-1">尝试其他搜索词</p>
            </div>
          </div>
        )}

        {/* 文档列表 */}
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
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
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-stone-400">
              <BookOpen className="w-10 h-10 mb-3 stroke-1" />
              <p className="text-sm font-medium">
                {search ? '未找到匹配的文档' : '暂无文档'}
              </p>
              <p className="text-xs mt-1">
                {search ? '尝试其他搜索词' : '上传法规文档以构建知识库'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">文件名</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50/80">来源</th>
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
                      <Badge variant={doc.source === 'builtin' ? 'teal' : 'stone'}>
                        {doc.source === 'builtin' ? '内置' : '用户'}
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
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
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
