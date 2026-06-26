/**
 * 应用常量配置
 */

export const APP_NAME = 'GMPilot';
export const APP_DESCRIPTION = 'GMP 偏差报告 AI 生成工具';

export const DEFAULT_AUDITBEE_URL = 'http://localhost:8000';

export const NAV_ITEMS = [
  { path: '/', icon: 'MessageSquare', label: '智能助手' },
  { path: '/reports', icon: 'FileText', label: '偏差报告' },
  { path: '/knowledge', icon: 'BookOpen', label: '知识库' },
  { path: '/settings', icon: 'Settings', label: '系统设置' },
] as const;
