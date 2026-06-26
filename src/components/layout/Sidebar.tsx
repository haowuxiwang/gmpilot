/**
 * 左侧导航栏
 * AI 科技感风格 — 品牌渐变 + 状态感知 + accent bar
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, FileText, BookOpen, Settings, Sun, Monitor } from 'lucide-react';
import { NAV_ITEMS } from '@/config/constants';
import { useTheme } from '@/providers/ThemeProvider';
import { settingsApi } from '@/services/api';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare,
  FileText,
  BookOpen,
  Settings,
};

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
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
      .catch(() => {});
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

  const toggleTheme = () => {
    setTheme(theme === 'system' ? 'light' : 'system');
  };

  const ThemeIcon = theme === 'system' ? Monitor : Sun;
  const themeLabel = theme === 'system' ? '跟随系统' : '浅色';

  return (
    <aside className="w-[260px] h-screen bg-white border-r border-stone-100 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-stone-100">
        <h1 className="text-base font-bold tracking-tight font-display bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent">
          GMPilot
        </h1>
        <p className="text-[11px] text-stone-400 mt-0.5 tracking-wide">
          AI · GMP 偏差分析
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 ease-out
                ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800 active:scale-[0.98]'
                }
              `}
            >
              {/* Active accent bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-teal-300 rounded-r-full" />
              )}
              {Icon && <Icon className="w-[18px] h-[18px]" />}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom: LLM status + theme toggle */}
      <div className="p-4 border-t border-stone-100 space-y-2">
        {/* LLM status */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-stone-50/60">
          <div className="relative flex-shrink-0">
            <div
              className={`w-2 h-2 rounded-full ${llmReady ? 'bg-emerald-500' : 'bg-stone-300'}`}
            />
            {llmReady && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-stone-500 truncate">
              {llmReady ? modelName || 'LLM 已连接' : '未配置 LLM'}
            </p>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-stone-500 hover:bg-stone-50 hover:text-stone-800 transition-all duration-200 active:scale-[0.98]"
          title={`当前主题：${themeLabel}`}
        >
          <ThemeIcon className="w-[18px] h-[18px]" strokeWidth={1.5} />
          <span>{themeLabel}</span>
        </button>
      </div>
    </aside>
  );
}
