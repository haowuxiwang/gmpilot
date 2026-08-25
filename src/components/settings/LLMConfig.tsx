/**
 * LLM 配置组件
 * 使用统一的 UI 组件库
 * 支持 Provider 选择和健康检查
 */

import { useState, useEffect } from 'react';
import { settingsApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/providers/ToastProvider';
import { ChevronDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { createLogger } from '@core/utils/logger';

const log = createLogger('LLMConfig');

interface Provider {
  id: string;
  name: string;
  defaultModel: string;
  defaultBaseUrl: string;
}

export function LLMConfig() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; error?: string } | null>(null);
  const { success, error: showError } = useToast();

  useEffect(() => {
    // 加载 Provider 列表
    if (window.gmpilot) {
      window.gmpilot.llm.getProviders().then(setProviders).catch((err) => log.error('Failed to load providers', { error: String(err) }));
    }

    // 加载设置
    settingsApi.get().then((s) => {
      // Masked API key → show empty field with "configured" placeholder
      const cleaned = { ...s };
      for (const [key, value] of Object.entries(cleaned)) {
        if (key.endsWith('_API_KEY') && value === '••••••••') {
          cleaned[key] = '';
          if (key === 'LLM_API_KEY') setKeyConfigured(true);
        }
      }
      setSettings(cleaned);
    }).catch((err) => log.error('Failed to load settings', { error: String(err) })).finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // 选择 Provider 时自动填充配置
  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      setSettings(prev => ({
        ...prev,
        LLM_BASE_URL: provider.defaultBaseUrl,
        LLM_MODEL: provider.defaultModel,
      }));
    }
  };

  // 测试连接
  const handleTestConnection = async () => {
    if (!window.gmpilot) return;

    setTesting(true);
    setTestResult(null);
    try {
      // 先保存设置
      await settingsApi.save(settings);
      window.dispatchEvent(new Event('settings-changed'));

      // 测试连接
      const result = await window.gmpilot.llm.testProvider(selectedProvider || 'openai');
      setTestResult(result);

      if (result.success) {
        success(`连接成功，延迟 ${result.latency}ms`);
      } else {
        showError(`连接失败：${result.error}`);
      }
    } catch (err) {
      setTestResult({ success: false, error: String(err) });
      showError(`测试失败：${err}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.save(settings);
      success('设置已保存');
      // 通知其他组件设置已变更
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
            LLM 配置
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            支持 OpenAI 兼容 API（DeepSeek、通义千问、智谱、OpenAI 等）
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Provider 选择 */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1.5">
              Provider
            </label>
            <div className="relative">
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderSelect(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm text-stone-900 bg-white border border-stone-200 rounded-xl outline-none transition-all duration-200 appearance-none cursor-pointer focus:border-teal-400 focus:ring-[3px] focus:ring-teal-600/10"
              >
                <option value="">自定义配置</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.defaultModel})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            </div>
            <p className="text-xs text-stone-500 mt-1.5">
              选择 Provider 自动填充 API 地址和模型名称
            </p>
          </div>

          <Input
            label="API 地址"
            value={settings.LLM_BASE_URL || ''}
            onChange={(e) => handleChange('LLM_BASE_URL', e.target.value)}
            placeholder="https://api.openai.com/v1"
            helperText="例如：https://api.deepseek.com/v1、https://api.openai.com/v1"
          />

          <Input
            label="模型名称"
            value={settings.LLM_MODEL || ''}
            onChange={(e) => handleChange('LLM_MODEL', e.target.value)}
            placeholder="gpt-4o"
            helperText="例如：deepseek-chat、qwen-plus、gpt-4o、claude-sonnet-4-20250514"
          />

          <Input
            label="API 密钥"
            type="password"
            value={settings.LLM_API_KEY || ''}
            onChange={(e) => handleChange('LLM_API_KEY', e.target.value)}
            placeholder={keyConfigured ? '已配置（留空保持不变）' : 'sk-...'}
          />

          {/* 测试连接 */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={handleTestConnection}
              disabled={testing || !settings.LLM_API_KEY}
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  测试中...
                </>
              ) : (
                '测试连接'
              )}
            </Button>

            {/* 测试结果 */}
            {testResult && (
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-emerald-600">
                      连接成功 ({testResult.latency}ms)
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">
                      {testResult.error || '连接失败'}
                    </span>
                  </>
                )}
              </div>
            )}
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
