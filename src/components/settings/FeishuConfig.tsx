/**
 * 飞书通知配置组件
 * 配置飞书开放平台应用机器人推送
 */

import { useState, useEffect, useCallback } from 'react';

interface FeishuConfigData {
  appId: string;
  appSecret: string;
  receiveIdType: string;
  receiveId: string;
  enabled: boolean;
}

export function FeishuConfig() {
  const [config, setConfig] = useState<FeishuConfigData>({
    appId: '',
    appSecret: '',
    receiveIdType: 'open_id',
    receiveId: '',
    enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const result = await window.gmpilot.notification.getFeishuConfig();
      if (result.success && result.config) {
        setConfig(result.config);
      }
    } catch {
      // ignore load errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const result = await window.gmpilot.notification.saveFeishuConfig(config);
      if (result.success) {
        setSaveResult({ success: true, message: '配置已保存' });
      } else {
        setSaveResult({ success: false, message: result.error || '保存失败' });
      }
    } catch {
      setSaveResult({ success: false, message: '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.gmpilot.notification.testFeishu();
      if (result.success) {
        setTestResult({ success: true, message: `连接成功 (${result.latency}ms)` });
      } else {
        setTestResult({ success: false, message: result.error || '连接失败' });
      }
    } catch {
      setTestResult({ success: false, message: '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-stone-100 rounded w-1/3" />
        <div className="h-9 bg-stone-100 rounded w-full" />
        <div className="h-9 bg-stone-100 rounded w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-stone-800 font-display">
          飞书通知
        </h2>
        {/* Enable toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-stone-500">
            {config.enabled ? '已启用' : '未启用'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              config.enabled ? 'bg-teal-600' : 'bg-stone-300'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                config.enabled ? 'translate-x-4.5' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>
      <p className="text-sm text-stone-400 mb-4">
        报告生成完成后自动推送通知到飞书（需在飞书开放平台创建自建应用）
      </p>

      <div className="space-y-3">
        {/* App ID */}
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            App ID
          </label>
          <input
            type="text"
            value={config.appId}
            onChange={(e) => setConfig((c) => ({ ...c, appId: e.target.value }))}
            placeholder="cli_xxxxxxxxxx"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
          />
        </div>

        {/* App Secret */}
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            App Secret
          </label>
          <input
            type="password"
            value={config.appSecret}
            onChange={(e) => setConfig((c) => ({ ...c, appSecret: e.target.value }))}
            placeholder="输入 App Secret"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
          />
        </div>

        {/* Receive ID Type */}
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            接收者类型
          </label>
          <select
            value={config.receiveIdType}
            onChange={(e) => setConfig((c) => ({ ...c, receiveIdType: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
          >
            <option value="open_id">open_id（个人）</option>
            <option value="chat_id">chat_id（群聊）</option>
            <option value="user_id">user_id（用户）</option>
            <option value="email">email（邮箱）</option>
          </select>
        </div>

        {/* Receive ID */}
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            接收者 ID
          </label>
          <input
            type="text"
            value={config.receiveId}
            onChange={(e) => setConfig((c) => ({ ...c, receiveId: e.target.value }))}
            placeholder="ou_xxxxxxxxxx 或 oc_xxxxxxxxxx"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 text-sm font-medium text-stone-700 bg-stone-100 rounded-lg hover:bg-stone-200 disabled:opacity-50 transition-colors"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
        </div>

        {/* Results */}
        {saveResult && (
          <p className={`text-xs ${saveResult.success ? 'text-teal-600' : 'text-red-500'}`}>
            {saveResult.message}
          </p>
        )}
        {testResult && (
          <p className={`text-xs ${testResult.success ? 'text-teal-600' : 'text-red-500'}`}>
            {testResult.message}
          </p>
        )}
      </div>
    </div>
  );
}
