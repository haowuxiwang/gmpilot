/**
 * 系统设置页面
 * 设计参考：Linear / Figma / VS Code 的设置架构
 * 左侧垂直 Tab 导航 + 右侧聚焦面板，降低信息密度
 */

import { useState } from 'react';
import { Cpu, FileText, Bell, ShieldCheck, Layout } from 'lucide-react';
import { LLMConfig } from '@/components/settings/LLMConfig';
import { TemplateManager } from '@/components/settings/TemplateManager';
import { TemplateConfig } from '@/components/settings/TemplateConfig';
import { FeishuConfig } from '@/components/settings/FeishuConfig';
import { AuditBeeStatus } from '@/components/audit/AuditBeeStatus';

type SettingsTab = 'llm' | 'templates' | 'reportTemplate' | 'notifications' | 'audit';

const TABS: { id: SettingsTab; label: string; desc: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }> }[] = [
  { id: 'llm', label: '模型配置', desc: 'LLM 提供商与 API', icon: Cpu },
  { id: 'templates', label: '模版管理', desc: '偏差报告模版', icon: FileText },
  { id: 'reportTemplate', label: '报告模板', desc: '多工厂 Word 模板', icon: Layout },
  { id: 'notifications', label: '通知推送', desc: '飞书机器人通知', icon: Bell },
  { id: 'audit', label: '合规审核', desc: '内置审核引擎', icon: ShieldCheck },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm');

  return (
    <div className="flex h-full bg-surface">
      {/* Left navigation */}
      <div className="w-[200px] flex-shrink-0 border-r border-stone-200/60 bg-stone-50/80 flex flex-col">
        <div className="px-4 pt-5 pb-3">
          <h1 className="text-[15px] font-semibold text-stone-900">设置</h1>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  group relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left
                  transition-all duration-150 ease-out
                  ${
                    isActive
                      ? 'bg-white text-stone-900 shadow-xs border border-stone-200/50'
                      : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100/80 border border-transparent'
                  }
                `}
              >
                {/* Active indicator bar */}
                <span
                  className={`
                    absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] rounded-r-full
                    transition-all duration-200 ease-out
                    ${isActive
                      ? 'h-4 bg-teal-500 opacity-100'
                      : 'h-0 bg-teal-500 opacity-0 group-hover:h-3 group-hover:opacity-60'
                    }
                  `}
                />
                <Icon
                  className={`w-4 h-4 flex-shrink-0 transition-colors duration-150 ${
                    isActive ? 'text-teal-600' : 'text-stone-400 group-hover:text-teal-600'
                  }`}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium leading-tight">{tab.label}</div>
                  <div className="text-[10px] text-stone-400 leading-tight mt-0.5">{tab.desc}</div>
                </div>
              </button>
            );
          })}
        </nav>
        <div className="px-4 pb-4">
          <p className="text-[10px] text-stone-300">GMPilot v0.1.0</p>
        </div>
      </div>

      {/* Right content panel */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl p-6">
          {activeTab === 'llm' && <LLMConfig />}
          {activeTab === 'templates' && <TemplateManager />}
          {activeTab === 'reportTemplate' && <TemplateConfig />}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <FeishuConfig />
            </div>
          )}
          {activeTab === 'audit' && (
            <div>
              <h2 className="text-base font-semibold text-stone-800 mb-1 font-display">
                合规审核
              </h2>
              <p className="text-sm text-stone-400 mb-4">
                内置审核引擎状态（报告生成后自动执行）
              </p>
              <AuditBeeStatus showSettings />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
