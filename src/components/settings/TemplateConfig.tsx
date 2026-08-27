/**
 * Template configuration component.
 * Allows users to select report templates for different factories.
 */

import { useState, useEffect } from 'react';
import { settingsApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/providers/ToastProvider';
import { Check, Upload, Loader2, Trash2 } from 'lucide-react';
import { createLogger } from '@core/utils/logger';

const log = createLogger('TemplateConfig');

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
}

export function TemplateConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selected, setSelected] = useState<string>('default');
  const { success, error: showError, info } = useToast();

  useEffect(() => {
    loadTemplates();
    // Load current selection
    settingsApi.get().then((s) => {
      setSelected(s.SELECTED_TEMPLATE || 'default');
    }).catch((err) => log.error('Failed to load settings', { error: String(err) })).finally(() => setLoading(false));
  }, []);

  const loadTemplates = () => {
    console.log('[TemplateConfig] loadTemplates called');
    if (window.gmpilot) {
      console.log('[TemplateConfig] Calling window.gmpilot.template.getAll()...');
      window.gmpilot.template.getAll().then((tpls) => {
        console.log('[TemplateConfig] Templates loaded:', JSON.stringify(tpls));
        setTemplates(tpls.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          builtIn: t.builtIn,
        })));
      }).catch((err) => {
        console.error('[TemplateConfig] Failed to load templates:', err);
        log.error('Failed to load templates', { error: String(err) });
      });
    } else {
      console.error('[TemplateConfig] window.gmpilot is undefined');
    }
  };

  const handleUpload = async () => {
    console.log('[TemplateConfig] handleUpload clicked');
    if (!window.gmpilot) {
      console.error('[TemplateConfig] window.gmpilot is undefined');
      showError('gmpilot API 未初始化');
      return;
    }
    console.log('[TemplateConfig] Calling window.gmpilot.template.upload()...');
    setUploading(true);
    try {
      const result = await window.gmpilot.template.upload();
      console.log('[TemplateConfig] Upload result:', JSON.stringify(result));
      if (result.success && result.template) {
        success(`模板上传成功：${result.template.description}`);
        loadTemplates();
        setSelected(result.template.id);
      } else {
        showError(result.error || '上传失败');
      }
    } catch (err) {
      console.error('[TemplateConfig] Upload error:', err);
      showError(`上传失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!window.gmpilot) return;
    try {
      const result = await window.gmpilot.template.delete(templateId);
      if (result.success) {
        info('模板已删除');
        loadTemplates();
        if (selected === templateId) setSelected('default');
      } else {
        showError(result.error || '删除失败');
      }
    } catch (err) {
      showError(`删除失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.save({ SELECTED_TEMPLATE: selected });
      success('模板设置已保存');
      window.dispatchEvent(new Event('settings-changed'));
    } catch (err) {
      showError(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-stone-900 font-display">
            报告模板
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            选择适合您工厂的偏差报告模板（字体、字号、缩进等样式不同）
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Template selection */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1.5">
              模板选择
            </label>
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`
                    flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150
                    ${selected === template.id
                      ? 'border-teal-300 bg-teal-50/50 ring-2 ring-teal-600/10'
                      : 'border-stone-200 hover:border-stone-300 bg-white'}
                  `}
                >
                  <label className="flex items-start gap-3 flex-1 cursor-pointer">
                    <input
                      type="radio"
                      name="template"
                      value={template.id}
                      checked={selected === template.id}
                      onChange={(e) => setSelected(e.target.value)}
                      className="mt-0.5 accent-teal-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-900">{template.name}</span>
                        {template.builtIn && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded-full">
                            内置
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">{template.description}</p>
                    </div>
                  </label>
                  {!template.builtIn && selected === template.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(template.id);
                      }}
                      className="p-1 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="删除模板"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {selected === template.id && (
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Upload button */}
          <div className="pt-2 border-t border-stone-100">
            <Button
              variant="secondary"
              onClick={handleUpload}
              disabled={uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  上传自定义模板
                </>
              )}
            </Button>
            <p className="text-xs text-stone-500 mt-2">
              支持 .docx 格式，应用会自动识别模板结构（背景/调查/结论/风险/CAPA/附件）
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存设置'}
        </Button>
      </div>
    </div>
  );
}
