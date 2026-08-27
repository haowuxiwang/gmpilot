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
import { Check } from 'lucide-react';
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
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selected, setSelected] = useState<string>('default');
  const { success, error: showError } = useToast();

  useEffect(() => {
    // Load available templates
    if (window.gmpilot) {
      window.gmpilot.template.getAll().then((tpls) => {
        setTemplates(tpls.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          builtIn: t.builtIn,
        })));
      }).catch((err) => log.error('Failed to load templates', { error: String(err) }));
    }

    // Load current selection
    settingsApi.get().then((s) => {
      setSelected(s.SELECTED_TEMPLATE || 'default');
    }).catch((err) => log.error('Failed to load settings', { error: String(err) })).finally(() => setLoading(false));
  }, []);

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
                <label
                  key={template.id}
                  className={`
                    flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150
                    ${selected === template.id
                      ? 'border-teal-300 bg-teal-50/50 ring-2 ring-teal-600/10'
                      : 'border-stone-200 hover:border-stone-300 bg-white'}
                  `}
                >
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
                  {selected === template.id && (
                    <Check className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  )}
                </label>
              ))}
            </div>
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
