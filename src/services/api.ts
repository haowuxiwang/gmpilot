/**
 * API service layer — wraps IPC calls to Electron main process.
 * Type-safe interface matching window.gmpilot from preload.ts.
 *
 * Gracefully degrades when running in browser (no Electron).
 */

import type { Report, ReportSummary, ReportInsert, KnowledgeDoc } from '@core/db/schema';

// Re-export types for renderer consumers
export type { Report, ReportSummary, ReportInsert, KnowledgeDoc };

export interface RetrievalResult {
  content: string;
  sectionPath: string;
  similarity: number;
  docId: number;
  chunkIndex: number;
}

// ============================================================================
// API availability check
// ============================================================================

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.gmpilot;
}

function getAPI() {
  if (!window.gmpilot) {
    throw new Error('GMPilot API not available. Are you running in Electron?');
  }
  return window.gmpilot;
}

// ============================================================================
// API functions — graceful degradation when not in Electron
// ============================================================================

// --- Settings ---

export const settingsApi = {
  get: async (): Promise<Record<string, string>> => {
    if (!isElectron()) return {};
    try {
      return await getAPI().db.getSettings();
    } catch (error) {
      console.error('settingsApi.get failed:', error);
      return {};
    }
  },
  save: async (settings: Record<string, string>): Promise<void> => {
    if (!isElectron()) return;
    const result = await getAPI().db.saveSettings(settings);
    if (result && !result.success) {
      throw new Error(result.error || '保存设置失败');
    }
  },
};

// --- Reports ---

export const reportApi = {
  list: async (options?: { limit?: number; offset?: number }): Promise<ReportSummary[]> => {
    if (!isElectron()) return [];
    return getAPI().db.getReports(options);
  },
  get: async (id: number): Promise<Report | null> => {
    if (!isElectron()) return null;
    return getAPI().db.getReport(id);
  },
  create: async (report: ReportInsert): Promise<number> => {
    if (!isElectron()) return 0;
    const result = await getAPI().db.createReport(report);
    if (!result.success) {
      throw new Error(result.error || '创建报告失败');
    }
    return result.id ?? 0;
  },
  delete: async (id: number): Promise<void> => {
    if (!isElectron()) return;
    const result = await getAPI().db.deleteReport(id);
    if (result && !result.success) {
      throw new Error(result.error || '删除报告失败');
    }
  },
};

// --- Knowledge ---

export const knowledgeApi = {
  query: async (query: string): Promise<RetrievalResult[]> => {
    if (!isElectron()) return [];
    return getAPI().knowledge.query(query) as Promise<RetrievalResult[]>;
  },
  // C-2 fix: Removed addDocument — use pickAndAdd instead
  listDocuments: async (): Promise<KnowledgeDoc[]> => {
    if (!isElectron()) return [];
    return getAPI().knowledge.listDocuments();
  },
  pickAndAdd: async (category?: string): Promise<{
    success: boolean;
    docId?: number;
    chunkCount?: number;
    filename?: string;
    error?: string;
  }> => {
    if (!isElectron()) return { success: false, error: 'Not in Electron' };
    return getAPI().knowledge.pickAndAdd(category);
  },
  deleteDocument: async (docId: number): Promise<void> => {
    if (!isElectron()) return;
    const result = await getAPI().knowledge.deleteDocument(docId);
    if (result && !result.success) {
      throw new Error(result.error || '删除文档失败');
    }
  },
};

// --- Templates ---

export interface TemplateInfo {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  fields: unknown[];
  lastModified: string;
}

export const templateApi = {
  list: async (): Promise<TemplateInfo[]> => {
    if (!isElectron()) return [];
    const result = await getAPI().template.list();
    return result.success ? (result.templates as TemplateInfo[]) : [];
  },
  get: async (templateId: string): Promise<unknown | null> => {
    if (!isElectron()) return null;
    const result = await getAPI().template.get(templateId);
    return result.success ? result.template : null;
  },
  getContent: async (templateId: string): Promise<string | null> => {
    if (!isElectron()) return null;
    const result = await getAPI().template.getContent(templateId);
    return result.success ? (result.content ?? null) : null;
  },
  update: async (templateId: string, content: string): Promise<boolean> => {
    if (!isElectron()) return false;
    const result = await getAPI().template.update(templateId, content);
    return result.success;
  },
  reset: async (templateId: string): Promise<boolean> => {
    if (!isElectron()) return false;
    const result = await getAPI().template.reset(templateId);
    return result.success;
  },
  clearCache: async (): Promise<boolean> => {
    if (!isElectron()) return false;
    const result = await getAPI().template.clearCache();
    return result.success;
  },
};
