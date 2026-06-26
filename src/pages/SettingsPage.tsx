/**
 * 系统设置页面
 * 统一使用 stone/teal 配色系统
 */

import { LLMConfig } from '@/components/settings/LLMConfig';
import { TemplateManager } from '@/components/settings/TemplateManager';
import { AuditBeeStatus } from '@/components/audit/AuditBeeStatus';
import { Separator } from '@/components/ui';

export function SettingsPage() {
  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="bg-white px-6 py-5 border-b border-stone-100">
        <h1 className="text-lg font-semibold text-stone-900 font-display">
          系统设置
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">配置 LLM 提供商和系统参数</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-8">
          {/* LLM Configuration */}
          <LLMConfig />

          <Separator />

          {/* Template Management */}
          <TemplateManager />

          <Separator />

          {/* AuditBee Configuration */}
          <div>
            <h2 className="text-base font-semibold text-stone-800 mb-1 font-display">
              AuditBee 配置
            </h2>
            <p className="text-sm text-stone-400 mb-4">
              配置 AuditBee 合规性审计服务连接
            </p>
            <AuditBeeStatus showSettings />
          </div>
        </div>
      </div>
    </div>
  );
}
