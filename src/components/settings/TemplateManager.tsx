/**
 * Template Manager component.
 * Provides UI for viewing, editing, and managing deviation report templates.
 * Supports Markdown editing and form editing with real-time preview.
 */

import { useState, useEffect } from 'react';
import { templateApi, type TemplateInfo } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/providers/ToastProvider';
import {
  FileText,
  Save,
  RotateCcw,
  Code,
  FormInput,
  Eye,
  ChevronRight,
} from 'lucide-react';

type EditMode = 'markdown' | 'form';

interface TemplateField {
  name: string;
  label: string;
  type: string;
  description?: string;
}

export function TemplateManager() {
  const { success: showSuccess, error: showError } = useToast();
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [editMode, setEditMode] = useState<EditMode>('markdown');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load templates
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const list = await templateApi.list();
      setTemplates(list);
    } catch {
      showError('加载模版列表失败');
    } finally {
      setLoading(false);
    }
  };

  // Load template content when selected
  useEffect(() => {
    if (selectedTemplate) {
      loadTemplateContent(selectedTemplate);
    }
  }, [selectedTemplate]);

  const loadTemplateContent = async (templateId: string) => {
    try {
      const content = await templateApi.getContent(templateId);
      if (content) {
        setContent(content);
        setHasChanges(false);
      }
    } catch {
      showError('加载模版内容失败');
    }
  };

  // Save template
  const handleSave = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    try {
      const result = await templateApi.update(selectedTemplate, content);
      if (result) {
        setHasChanges(false);
        showSuccess('模版已保存');
        // Reload templates to update last modified
        await loadTemplates();
      } else {
        showError('保存模版失败');
      }
    } catch {
      showError('保存模版失败');
    } finally {
      setSaving(false);
    }
  };

  // Reset template
  const handleReset = async () => {
    if (!selectedTemplate) return;

    if (!window.confirm('确定要重置此模版为默认内容吗？')) {
      return;
    }

    try {
      const result = await templateApi.reset(selectedTemplate);
      if (result) {
        await loadTemplateContent(selectedTemplate);
        showSuccess('模版已重置');
      } else {
        showError('重置模版失败（可能没有备份）');
      }
    } catch {
      showError('重置模版失败');
    }
  };

  // Handle content change
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(true);
  };

  // Get selected template info
  const selectedTemplateInfo = templates.find(t => t.id === selectedTemplate);

  // Render preview
  const renderPreview = () => {
    if (!content) return <div className="text-stone-400">请选择一个模版</div>;

    // Simple markdown-like preview
    const lines = content.split('\n');
    return (
      <div className="prose prose-sm max-w-none">
        {lines.map((line, i) => {
          if (line.startsWith('# ')) {
            return <h1 key={i} className="text-lg font-bold mt-4 mb-2">{line.substring(2)}</h1>;
          }
          if (line.startsWith('## ')) {
            return <h2 key={i} className="text-base font-semibold mt-3 mb-1">{line.substring(3)}</h2>;
          }
          if (line.startsWith('| ')) {
            // Table row
            const cells = line.split('|').filter(Boolean).map(c => c.trim());
            return (
              <div key={i} className="flex gap-2 text-xs font-mono bg-stone-50 px-2 py-1">
                {cells.map((cell, j) => (
                  <span key={j} className="flex-1">{cell}</span>
                ))}
              </div>
            );
          }
          if (line.trim() === '') {
            return <div key={i} className="h-2" />;
          }
          return <p key={i} className="text-sm text-stone-700 my-1">{line}</p>;
        })}
      </div>
    );
  };

  // Render form editor
  const renderFormEditor = () => {
    if (!selectedTemplateInfo) return null;

    const fields = selectedTemplateInfo.fields as TemplateField[];
    if (!fields || fields.length === 0) {
      return <div className="text-stone-400">此模版没有可编辑的字段</div>;
    }

    return (
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {field.label || field.name}
            </label>
            {field.type === 'longtext' ? (
              <textarea
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-teal-400"
                rows={3}
                placeholder={field.description || `输入 ${field.label || field.name}`}
              />
            ) : (
              <Input
                placeholder={field.description || `输入 ${field.label || field.name}`}
              />
            )}
            {field.description && (
              <p className="text-xs text-stone-400 mt-1">{field.description}</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Template List */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-stone-900 font-display">
            模版管理
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            查看和编辑偏差报告模版
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template.id)}
                className={`
                  flex items-center gap-3 p-3 rounded-xl border transition-all
                  ${selectedTemplate === template.id
                    ? 'border-teal-400 bg-teal-50 shadow-sm'
                    : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                  }
                `}
              >
                <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-stone-500" />
                </div>
                <div className="text-left min-w-0">
                  <div className="text-sm font-medium text-stone-800 truncate">
                    {template.title}
                  </div>
                  <div className="text-xs text-stone-400">
                    {(template.fields as unknown[])?.length || 0} 个字段
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-300 ml-auto flex-shrink-0" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Template Editor */}
      {selectedTemplate && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-stone-900">
                  {selectedTemplateInfo?.title || selectedTemplate}
                </h3>
                <p className="text-sm text-stone-500 mt-1">
                  {selectedTemplateInfo?.description || '编辑模版内容'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditMode(editMode === 'markdown' ? 'form' : 'markdown')}
                >
                  {editMode === 'markdown' ? (
                    <>
                      <FormInput className="w-4 h-4 mr-1.5" />
                      表单模式
                    </>
                  ) : (
                    <>
                      <Code className="w-4 h-4 mr-1.5" />
                      Markdown
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Editor Area - Split View */}
            <div className="flex gap-4 min-h-[400px]">
              {/* Left: Editor */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-stone-400" />
                    <span className="text-xs font-medium text-stone-500">
                      {editMode === 'markdown' ? 'Markdown 编辑器' : '表单编辑器'}
                    </span>
                  </div>
                  {hasChanges && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                      未保存
                    </span>
                  )}
                </div>
                {editMode === 'markdown' ? (
                  <textarea
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className="flex-1 w-full px-4 py-3 text-sm font-mono text-stone-800 bg-stone-50 border border-stone-200 rounded-lg resize-none focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/20"
                    placeholder="输入模版内容..."
                  />
                ) : (
                  <div className="flex-1 overflow-auto p-4 bg-stone-50 border border-stone-200 rounded-lg">
                    {renderFormEditor()}
                  </div>
                )}
              </div>

              {/* Right: Preview */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-stone-400" />
                  <span className="text-xs font-medium text-stone-500">实时预览</span>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-white border border-stone-200 rounded-lg">
                  {renderPreview()}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-stone-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-stone-500"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                重置为默认
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saving}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
                    保存模版
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
