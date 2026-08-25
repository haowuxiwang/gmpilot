/**
 * 左侧导航栏
 * 无 logo 极简设计 — 可折叠（240px ↔ 48px 图标态）
 * 精致灰阶 + 单一强调色 + 微妙阴影
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, FileText, BookOpen, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_ITEMS } from '@/config/constants';
import { settingsApi } from '@/services/api';
import { createLogger } from '@core/utils/logger';

const log = createLogger('Sidebar');

const iconMap: Record<string, React.ComponentType<{ className?: string; strokeWidth?: string | number }>> = {
  MessageSquare,
  FileText,
  BookOpen,
  Settings,
};

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [modelName, setModelName] = useState<string>('');
  const [llmReady, setLlmReady] = useState(false);

  // 获取 LLM 设置
  const fetchSettings = () => {
    settingsApi
      .get()
      .then((s) => {
        const model = s.LLM_MODEL || '';
        const key = s.LLM_API_KEY || '';
        setModelName(model);
        setLlmReady(!!(model && key));
      })
      .catch((err) => log.debug('Failed to load settings', { error: String(err) }));
  };

  useEffect(() => {
    fetchSettings();

    // 监听设置变更事件
    const handleSettingsChange = () => {
      fetchSettings();
    };

    window.addEventListener('settings-changed', handleSettingsChange);
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange);
    };
  }, []);

  return (
    <aside
      className={`
        h-screen bg-stone-50/80 border-r border-stone-200/60 flex flex-col flex-shrink-0 select-none
        transition-[width] duration-300 ease-out
        ${collapsed ? 'w-[48px]' : 'w-[240px]'}
      `}
    >
      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={`
                group relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium
                transition-all duration-150 ease-out
                ${collapsed ? 'justify-center' : ''}
                ${
                  isActive
                    ? 'bg-white text-stone-900 shadow-xs border border-stone-200/50'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100/80 border border-transparent'
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
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-2.5 pb-3 space-y-1">
        {/* LLM Status — minimal dot badge */}
        <div
          title={llmReady ? `${modelName || 'LLM 已连接'} · 运行就绪` : '未配置 LLM · 请在设置中配置'}
          className={`
            flex items-center rounded-lg transition-colors
            ${collapsed ? 'justify-center py-2' : 'gap-2.5 px-2.5 py-2.5 hover:bg-stone-100/60'}
          `}
        >
          <div className="relative flex-shrink-0">
            <div
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                llmReady ? 'bg-emerald-500' : 'bg-stone-300'
              }`}
            />
            {llmReady && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30" />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-stone-600 truncate leading-tight">
                {llmReady ? modelName || 'LLM 已连接' : '未配置 LLM'}
              </p>
              <p className="text-[10px] text-stone-400 leading-tight">
                {llmReady ? '运行就绪' : '请在设置中配置'}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`
            w-full flex items-center rounded-lg transition-all duration-150
            ${collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2'}
            text-stone-400 hover:text-stone-600 hover:bg-stone-100/80
          `}
          title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" strokeWidth={1.5} />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-[13px]">折叠</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
