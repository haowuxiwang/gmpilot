import { contextBridge, ipcRenderer } from 'electron';
import type { Report, ReportInsert, KnowledgeDoc, AuditTask } from '../core/db/schema';
import type { DeviationReport } from '../core/workflow/types';
import type { AuditBeeFinding, AuditBeeTask } from '../core/integration/types';
import type { WorkflowProgress, AuditBeeProgress } from '../core/types/ipc';

// Expose gmpilot API to renderer process
contextBridge.exposeInMainWorld('gmpilot', {
  // Database operations
  db: {
    getSettings: () => ipcRenderer.invoke('db:getSettings'),
    saveSettings: (settings: Record<string, string>) =>
      ipcRenderer.invoke('db:saveSettings', settings),
    getReports: (options?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('db:getReports', options),
    getReport: (id: number) => ipcRenderer.invoke('db:getReport', id),
    createReport: (report: ReportInsert) => ipcRenderer.invoke('db:createReport', report),
    deleteReport: (id: number) => ipcRenderer.invoke('db:deleteReport', id),
  },

  // Knowledge base operations
  knowledge: {
    query: (query: string) => ipcRenderer.invoke('knowledge:query', query),
    // C-2 fix: Removed addDocument — use pickAndAdd (dialog-based) instead
    listDocuments: () => ipcRenderer.invoke('knowledge:listDocuments'),
    pickAndAdd: () => ipcRenderer.invoke('knowledge:pickAndAdd'),
    deleteDocument: (docId: number) => ipcRenderer.invoke('knowledge:deleteDocument', docId),
    getContext: (query: string) => ipcRenderer.invoke('knowledge:getContext', query),
    stats: () => ipcRenderer.invoke('knowledge:stats'),
  },

  // LLM operations
  llm: {
    generate: (params: { prompt: string; systemPrompt?: string }) =>
      ipcRenderer.invoke('llm:generate', params),
    stream: (params: { prompt: string; systemPrompt?: string }) =>
      ipcRenderer.invoke('llm:stream', params),
    onChunk: (callback: (data: { chunk: string }) => void) => {
      ipcRenderer.on('llm:stream:chunk', (_event, data) => callback(data));
    },
    onDone: (callback: () => void) => {
      ipcRenderer.on('llm:stream:done', () => callback());
    },
    onError: (callback: (data: { error: string }) => void) => {
      ipcRenderer.on('llm:stream:error', (_event, data) => callback(data));
    },
    offStream: () => {
      ipcRenderer.removeAllListeners('llm:stream:chunk');
      ipcRenderer.removeAllListeners('llm:stream:done');
      ipcRenderer.removeAllListeners('llm:stream:error');
    },
    getProviders: () => ipcRenderer.invoke('llm:providers'),
    testProvider: (provider: string) => ipcRenderer.invoke('llm:test', provider),
  },

  // Workflow operations
  workflow: {
    runDeviation: (clueText: string, files?: { name: string; content?: string }[]) =>
      ipcRenderer.invoke('workflow:runDeviation', clueText, files),
    onProgress: (callback: (data: WorkflowProgress) => void) => {
      ipcRenderer.on('workflow:progress', (_event, data) => callback(data));
    },
    offProgress: () => {
      ipcRenderer.removeAllListeners('workflow:progress');
    },
    // 优化2: 流式报告内容监听
    onStreaming: (callback: (data: { partial: Partial<DeviationReport> }) => void) => {
      ipcRenderer.on('workflow:streaming', (_event, data) => callback(data));
    },
    offStreaming: () => {
      ipcRenderer.removeAllListeners('workflow:streaming');
    },
  },

  // File operations
  file: {
    // C-1 fix: Removed readFile — use pickAndRead (dialog-based) instead
    pickAndRead: () => ipcRenderer.invoke('file:pickAndRead'),
    exportPdf: (report: DeviationReport) => ipcRenderer.invoke('file:exportPdf', report),
  },

  // AuditBee integration
  auditbee: {
    // C-3 fix: Removed baseUrl param from all methods — SSRF prevention
    checkHealth: () => ipcRenderer.invoke('auditbee:checkHealth'),
    auditReport: (params: { report: DeviationReport; reportId?: number }) =>
      ipcRenderer.invoke('auditbee:auditReport', params),
    getFindings: (params: { taskId: number }) =>
      ipcRenderer.invoke('auditbee:getFindings', params),
    getTaskStatus: (params: { taskId: number }) =>
      ipcRenderer.invoke('auditbee:getTaskStatus', params),
    getAuditHistory: (reportId: number) =>
      ipcRenderer.invoke('auditbee:getAuditHistory', reportId),
    onProgress: (callback: (data: AuditBeeProgress) => void) => {
      ipcRenderer.on('auditbee:progress', (_event, data) => callback(data));
    },
    offProgress: () => {
      ipcRenderer.removeAllListeners('auditbee:progress');
    },
  },

  // Template operations
  template: {
    list: () => ipcRenderer.invoke('template:list'),
    get: (templateId: string) => ipcRenderer.invoke('template:get', templateId),
    getContent: (templateId: string) => ipcRenderer.invoke('template:getContent', templateId),
    update: (templateId: string, content: string) => ipcRenderer.invoke('template:update', templateId, content),
    reset: (templateId: string) => ipcRenderer.invoke('template:reset', templateId),
    clearCache: () => ipcRenderer.invoke('template:clearCache'),
  },
});

// Re-export types for backward compatibility
export type { WorkflowProgress, AuditBeeProgress } from '../core/types/ipc';

// Type definition for window.gmpilot
export interface GmpilotAPI {
  db: {
    getSettings: () => Promise<Record<string, string>>;
    saveSettings: (settings: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
    getReports: (options?: { limit?: number; offset?: number }) => Promise<Report[]>;
    getReport: (id: number) => Promise<Report | null>;
    createReport: (report: ReportInsert) => Promise<{ success: boolean; id?: number; error?: string }>;
    deleteReport: (id: number) => Promise<{ success: boolean; error?: string }>;
  };
  knowledge: {
    query: (query: string) => Promise<unknown[]>;
    // C-2 fix: Removed addDocument
    listDocuments: () => Promise<KnowledgeDoc[]>;
    pickAndAdd: () => Promise<{ success: boolean; docId?: number; chunkCount?: number; filename?: string; error?: string }>;
    deleteDocument: (docId: number) => Promise<{ success: boolean; error?: string }>;
    getContext: (query: string) => Promise<string>;
    stats: () => Promise<{ docCount: number; chunkCount: number; isAvailable: boolean }>;
  };
  llm: {
    generate: (params: { prompt: string; systemPrompt?: string }) => Promise<{ success: boolean; text?: string; error?: string }>;
    stream: (params: { prompt: string; systemPrompt?: string }) => Promise<{ success: boolean; error?: string }>;
    onChunk: (callback: (data: { chunk: string }) => void) => void;
    onDone: (callback: () => void) => void;
    onError: (callback: (data: { error: string }) => void) => void;
    offStream: () => void;
    getProviders: () => Promise<{ id: string; name: string; defaultModel: string; defaultBaseUrl: string }[]>;
    testProvider: (provider: string) => Promise<{ success: boolean; latency?: number; error?: string }>;
  };
  workflow: {
    runDeviation: (clueText: string, files?: { name: string; content?: string }[]) => Promise<{ success: boolean; report?: DeviationReport; error?: string }>;
    onProgress: (callback: (data: WorkflowProgress) => void) => void;
    offProgress: () => void;
    onStreaming: (callback: (data: { partial: Partial<DeviationReport> }) => void) => void;
    offStreaming: () => void;
  };
  file: {
    // C-1 fix: Removed readFile — use pickAndRead instead
    pickAndRead: () => Promise<{ success: boolean; content?: string; filePath?: string; error?: string }>;
    exportPdf: (report: DeviationReport) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  };
  auditbee: {
    // C-3 fix: Removed baseUrl param from all methods
    checkHealth: () => Promise<{ available: boolean; error?: string }>;
    auditReport: (params: { report: DeviationReport; reportId?: number }) => Promise<{ success: boolean; findings?: AuditBeeFinding[]; taskId?: number; error?: string }>;
    getFindings: (params: { taskId: number }) => Promise<{ success: boolean; findings?: AuditBeeFinding[]; error?: string }>;
    getTaskStatus: (params: { taskId: number }) => Promise<{ success: boolean; task?: AuditBeeTask; error?: string }>;
    getAuditHistory: (reportId: number) => Promise<AuditTask[]>;
    onProgress: (callback: (data: AuditBeeProgress) => void) => void;
    offProgress: () => void;
  };
  template: {
    list: () => Promise<{ success: boolean; templates?: unknown[]; error?: string }>;
    get: (templateId: string) => Promise<{ success: boolean; template?: unknown; error?: string }>;
    getContent: (templateId: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    update: (templateId: string, content: string) => Promise<{ success: boolean; error?: string }>;
    reset: (templateId: string) => Promise<{ success: boolean; error?: string }>;
    clearCache: () => Promise<{ success: boolean; error?: string }>;
  };
}

declare global {
  interface Window {
    gmpilot: GmpilotAPI;
  }
}
