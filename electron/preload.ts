import { contextBridge, ipcRenderer } from 'electron';
import type { Report, ReportSummary, ReportInsert, KnowledgeDoc, Conversation, ConversationInsert } from '../core/db/schema';
import type { DeviationReport } from '../core/workflow/types';
import type { WorkflowProgress } from '../core/types/ipc';

// Expose gmpilot API to renderer process
contextBridge.exposeInMainWorld('gmpilot', {
  // Bundled resource paths (fonts etc.), resolvable via file:// in renderer
  resources: {
    getFontPath: () => ipcRenderer.invoke('resources:getFontPath'),
  },

  // Database operations
  db: {
    getSettings: () => ipcRenderer.invoke('db:getSettings'),
    saveSettings: (settings: Record<string, string>) =>
      ipcRenderer.invoke('db:saveSettings', settings),
    getReports: (options?: { limit?: number; offset?: number }): Promise<ReportSummary[]> =>
      ipcRenderer.invoke('db:getReports', options),
    getReport: (id: number): Promise<Report | null> => ipcRenderer.invoke('db:getReport', id),
    createReport: (report: ReportInsert) => ipcRenderer.invoke('db:createReport', report),
    deleteReport: (id: number) => ipcRenderer.invoke('db:deleteReport', id),
    getConversations: (options?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('db:getConversations', options),
    getConversation: (id: number) => ipcRenderer.invoke('db:getConversation', id),
    createConversation: (conversation: ConversationInsert) => ipcRenderer.invoke('db:createConversation', conversation),
    updateConversation: (id: number, title: string, messagesJson: string) =>
      ipcRenderer.invoke('db:updateConversation', id, title, messagesJson),
    deleteConversation: (id: number) => ipcRenderer.invoke('db:deleteConversation', id),
  },

  // Knowledge base operations
  knowledge: {
    query: (query: string) => ipcRenderer.invoke('knowledge:query', query),
    // C-2 fix: Removed addDocument — use pickAndAdd (dialog-based) instead
    listDocuments: () => ipcRenderer.invoke('knowledge:listDocuments'),
    pickAndAdd: (category?: string) => ipcRenderer.invoke('knowledge:pickAndAdd', category),
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
      ipcRenderer.removeAllListeners('llm:stream:chunk'); // Prevent listener accumulation
      ipcRenderer.on('llm:stream:chunk', (_event, data) => callback(data));
    },
    onDone: (callback: () => void) => {
      ipcRenderer.removeAllListeners('llm:stream:done');
      ipcRenderer.on('llm:stream:done', () => callback());
    },
    onError: (callback: (data: { error: string }) => void) => {
      ipcRenderer.removeAllListeners('llm:stream:error');
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
    cancel: () => ipcRenderer.invoke('workflow:cancel'),
    reviseTargeted: (params: { report: unknown; targets: string[]; revisionContext: string; analysis?: unknown; factors?: unknown; regulations?: unknown[]; findings?: unknown[] }) =>
      ipcRenderer.invoke('workflow:reviseTargeted', params),
    onProgress: (callback: (data: WorkflowProgress) => void) => {
      ipcRenderer.removeAllListeners('workflow:progress'); // Prevent listener accumulation
      ipcRenderer.on('workflow:progress', (_event, data) => callback(data));
    },
    offProgress: () => {
      ipcRenderer.removeAllListeners('workflow:progress');
    },
    // 优化2: 流式报告内容监听
    onStreaming: (callback: (data: { partial: Partial<DeviationReport> }) => void) => {
      ipcRenderer.removeAllListeners('workflow:streaming'); // Prevent listener accumulation
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
    exportDocx: (report: DeviationReport) => ipcRenderer.invoke('file:exportDocx', report),
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

  // Notification operations (Feishu)
  notification: {
    getFeishuConfig: () => ipcRenderer.invoke('notification:getFeishuConfig'),
    saveFeishuConfig: (config: { appId?: string; appSecret?: string; receiveIdType?: string; receiveId?: string; enabled?: boolean }) =>
      ipcRenderer.invoke('notification:saveFeishuConfig', config),
    testFeishu: () => ipcRenderer.invoke('notification:testFeishu'),
  },

  // Logging operations (forward renderer logs to main process)
  log: {
    forward: (entry: { level: 'debug' | 'info' | 'warn' | 'error'; module: string; message: string; data?: Record<string, unknown>; error?: { message: string; stack?: string } }) =>
      ipcRenderer.invoke('log:forward', entry),
  },
});

// Re-export types for backward compatibility
export type { WorkflowProgress } from '../core/types/ipc';

// Type definition for window.gmpilot
export interface GmpilotAPI {
  resources: {
    getFontPath: () => Promise<string>;
  };
  db: {
    getSettings: () => Promise<Record<string, string>>;
    saveSettings: (settings: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
    getReports: (options?: { limit?: number; offset?: number }) => Promise<Report[]>;
    getReport: (id: number) => Promise<Report | null>;
    createReport: (report: ReportInsert) => Promise<{ success: boolean; id?: number; error?: string }>;
    deleteReport: (id: number) => Promise<{ success: boolean; error?: string }>;
    getConversations: (options?: { limit?: number; offset?: number }) => Promise<Conversation[]>;
    getConversation: (id: number) => Promise<Conversation | null>;
    createConversation: (conversation: ConversationInsert) => Promise<{ success: boolean; id?: number; error?: string }>;
    updateConversation: (id: number, title: string, messagesJson: string) => Promise<{ success: boolean; error?: string }>;
    deleteConversation: (id: number) => Promise<{ success: boolean; error?: string }>;
  };
  knowledge: {
    query: (query: string) => Promise<unknown[]>;
    // C-2 fix: Removed addDocument
    listDocuments: () => Promise<KnowledgeDoc[]>;
    pickAndAdd: (category?: string) => Promise<{ success: boolean; docId?: number; chunkCount?: number; filename?: string; category?: string; error?: string }>;
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
    runDeviation: (clueText: string, files?: { name: string; content?: string }[]) => Promise<{ success: boolean; report?: DeviationReport; auditFindings?: unknown[]; auditScore?: number; auditSummary?: string; fallbackModules?: string[]; error?: string }>;
    cancel: () => Promise<{ success: boolean; error?: string }>;
    reviseTargeted: (params: { report: unknown; targets: string[]; revisionContext: string }) => Promise<{ success: boolean; report?: DeviationReport; fallbackModules?: string[]; auditFindings?: unknown[]; auditScore?: number; auditSummary?: string; error?: string }>;
    onProgress: (callback: (data: WorkflowProgress) => void) => void;
    offProgress: () => void;
    onStreaming: (callback: (data: { partial: Partial<DeviationReport> }) => void) => void;
    offStreaming: () => void;
  };
  file: {
    // C-1 fix: Removed readFile — use pickAndRead instead
    pickAndRead: () => Promise<{ success: boolean; content?: string; filePath?: string; error?: string }>;
    exportPdf: (report: DeviationReport) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    exportDocx: (report: DeviationReport) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  };
  template: {
    list: () => Promise<{ success: boolean; templates?: unknown[]; error?: string }>;
    get: (templateId: string) => Promise<{ success: boolean; template?: unknown; error?: string }>;
    getContent: (templateId: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    update: (templateId: string, content: string) => Promise<{ success: boolean; error?: string }>;
    reset: (templateId: string) => Promise<{ success: boolean; error?: string }>;
    clearCache: () => Promise<{ success: boolean; error?: string }>;
  };
  notification: {
    getFeishuConfig: () => Promise<{ success: boolean; config?: { appId: string; appSecret: string; receiveIdType: string; receiveId: string; enabled: boolean }; error?: string }>;
    saveFeishuConfig: (config: { appId?: string; appSecret?: string; receiveIdType?: string; receiveId?: string; enabled?: boolean }) => Promise<{ success: boolean; error?: string }>;
    testFeishu: () => Promise<{ success: boolean; latency?: number; error?: string }>;
  };
  log: {
    forward: (entry: { level: 'debug' | 'info' | 'warn' | 'error'; module: string; message: string; data?: Record<string, unknown>; error?: { message: string; stack?: string } }) => Promise<void>;
  };
}

declare global {
  interface Window {
    gmpilot: GmpilotAPI;
  }
}
