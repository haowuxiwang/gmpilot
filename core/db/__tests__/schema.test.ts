import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../connection';
import {
  getSetting,
  getAllSettings,
  setSetting,
  setSettings,
  getReports,
  getReport,
  createReport,
  deleteReport,
  getKnowledgeDocs,
  createKnowledgeDoc,
  deleteKnowledgeDoc,
  getKnowledgeDocIdsByCategories,
  getAuditTasksByReport,
  getAuditTask,
  createAuditTask,
  updateAuditTaskResult,
  deleteAuditTask,
  saveCheckpoint,
  loadCheckpoint,
  deleteCheckpoint,
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  type ReportInsert,
} from '../schema';

let db: Database.Database;

beforeAll(async () => {
  db = new Database(':memory:');
  await initSchema(db);
});

afterAll(() => {
  db.close();
});

describe('Settings CRUD', () => {
  it('should return null for non-existent setting', () => {
    expect(getSetting(db, 'nonexistent')).toBeNull();
  });

  it('should set and get a setting', () => {
    setSetting(db, 'test_key', 'test_value');
    expect(getSetting(db, 'test_key')).toBe('test_value');
  });

  it('should update existing setting', () => {
    setSetting(db, 'test_key', 'updated_value');
    expect(getSetting(db, 'test_key')).toBe('updated_value');
  });

  it('should get all settings', () => {
    setSetting(db, 'key_a', 'value_a');
    setSetting(db, 'key_b', 'value_b');
    const settings = getAllSettings(db);
    expect(settings['key_a']).toBe('value_a');
    expect(settings['key_b']).toBe('value_b');
  });

  it('should batch set settings', () => {
    setSettings(db, { batch_1: 'b1', batch_2: 'b2' });
    expect(getSetting(db, 'batch_1')).toBe('b1');
    expect(getSetting(db, 'batch_2')).toBe('b2');
  });
});

describe('Reports CRUD', () => {
  let reportId: number;

  it('should create a report', () => {
    const report: ReportInsert = {
      title: '测试偏差报告',
      content: '# 测试报告\n\n这是测试内容。',
      deviation_id: 'DEV-001',
    };
    reportId = createReport(db, report);
    expect(reportId).toBeGreaterThan(0);
  });

  it('should get a report by id', () => {
    const report = getReport(db, reportId);
    expect(report).not.toBeNull();
    expect(report!.title).toBe('测试偏差报告');
    expect(report!.deviation_id).toBe('DEV-001');
  });

  it('should list reports', () => {
    const reports = getReports(db);
    expect(reports.length).toBeGreaterThanOrEqual(1);
  });

  it('should return null for non-existent report', () => {
    expect(getReport(db, 99999)).toBeNull();
  });

  it('should delete a report', () => {
    deleteReport(db, reportId);
    expect(getReport(db, reportId)).toBeNull();
  });
});

describe('Knowledge Docs CRUD', () => {
  let docId: number;

  it('should create a knowledge doc', () => {
    docId = createKnowledgeDoc(db, {
      filename: 'test_regulation.txt',
      source: 'builtin',
      content: '这是测试法规内容。',
    });
    expect(docId).toBeGreaterThan(0);
  });

  it('should list knowledge docs', () => {
    const docs = getKnowledgeDocs(db);
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter by source', () => {
    createKnowledgeDoc(db, {
      filename: 'user_doc.txt',
      source: 'user',
      content: '用户文档',
    });
    const builtinDocs = getKnowledgeDocs(db, 'builtin');
    const userDocs = getKnowledgeDocs(db, 'user');
    expect(builtinDocs.every((d) => d.source === 'builtin')).toBe(true);
    expect(userDocs.every((d) => d.source === 'user')).toBe(true);
  });

  it('should delete a knowledge doc', () => {
    deleteKnowledgeDoc(db, docId);
    expect(getKnowledgeDocs(db).find((d) => d.id === docId)).toBeUndefined();
  });

  it('should get knowledge doc ids by categories', () => {
    createKnowledgeDoc(db, { filename: 'cat_doc.txt', source: 'builtin', content: '内容', category: 'regulation' });
    createKnowledgeDoc(db, { filename: 'cat_doc2.txt', source: 'builtin', content: '内容', category: 'sop' });
    const ids = getKnowledgeDocIdsByCategories(db, ['regulation', 'sop']);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // Empty categories returns empty
    expect(getKnowledgeDocIdsByCategories(db, [])).toEqual([]);
  });
});

describe('Audit Tasks CRUD', () => {
  let reportId: number;
  let taskId: number;

  beforeAll(() => {
    reportId = createReport(db, { title: '审计测试报告', content: '内容', deviation_id: 'DEV-AUDIT' });
  });

  it('should create an audit task', () => {
    taskId = createAuditTask(db, {
      report_id: reportId,
      auditbee_task_id: 1,
      status: 'pending',
      findings_json: undefined,
    });
    expect(taskId).toBeGreaterThan(0);
  });

  it('should get audit task by id', () => {
    const task = getAuditTask(db, taskId);
    expect(task).not.toBeNull();
    expect(task!.auditbee_task_id).toBe(1);
    expect(task!.status).toBe('pending');
  });

  it('should return null for non-existent audit task', () => {
    expect(getAuditTask(db, 99999)).toBeNull();
  });

  it('should get audit tasks by report', () => {
    const tasks = getAuditTasksByReport(db, reportId);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks[0].report_id).toBe(reportId);
  });

  it('should update audit task result', () => {
    updateAuditTaskResult(db, taskId, 'completed', '{"score":85}');
    const task = getAuditTask(db, taskId);
    expect(task!.status).toBe('completed');
    expect(task!.findings_json).toBe('{"score":85}');
  });

  it('should delete audit task', () => {
    deleteAuditTask(db, taskId);
    expect(getAuditTask(db, taskId)).toBeNull();
  });
});

describe('Workflow Checkpoints', () => {
  it('should save and load a checkpoint', () => {
    saveCheckpoint(db, 'corr-001', 'analyzing', { step: 2, data: 'test' });
    const cp = loadCheckpoint(db, 'corr-001');
    expect(cp).not.toBeNull();
    expect(cp!.step).toBe('analyzing');
    expect(JSON.parse(cp!.context_json)).toEqual({ step: 2, data: 'test' });
  });

  it('should update existing checkpoint on conflict', () => {
    saveCheckpoint(db, 'corr-001', 'generating', { step: 5 });
    const cp = loadCheckpoint(db, 'corr-001');
    expect(cp!.step).toBe('generating');
  });

  it('should return null for non-existent checkpoint', () => {
    expect(loadCheckpoint(db, 'nonexistent')).toBeNull();
  });

  it('should delete a checkpoint', () => {
    deleteCheckpoint(db, 'corr-001');
    expect(loadCheckpoint(db, 'corr-001')).toBeNull();
  });

  it('should not throw on delete of non-existent checkpoint', () => {
    expect(() => deleteCheckpoint(db, 'no-such-id')).not.toThrow();
  });
});

describe('Conversations CRUD', () => {
  let conversationId: number;

  it('should create a conversation', () => {
    conversationId = createConversation(db, {
      title: '测试对话',
      messages_json: JSON.stringify([{ role: 'user', content: 'hello' }]),
    });
    expect(conversationId).toBeGreaterThan(0);
  });

  it('should get a conversation by id', () => {
    const conversation = getConversation(db, conversationId);
    expect(conversation).not.toBeNull();
    expect(conversation!.title).toBe('测试对话');
    expect(conversation!.messages_json).toContain('hello');
  });

  it('should list conversations', () => {
    const conversations = getConversations(db);
    expect(conversations.length).toBeGreaterThanOrEqual(1);
  });

  it('should return null for non-existent conversation', () => {
    expect(getConversation(db, 99999)).toBeNull();
  });

  it('should update a conversation', () => {
    updateConversation(db, conversationId, '更新后的对话', JSON.stringify([{ role: 'user', content: 'updated' }]));
    const conversation = getConversation(db, conversationId);
    expect(conversation!.title).toBe('更新后的对话');
    expect(conversation!.messages_json).toContain('updated');
  });

  it('should delete a conversation', () => {
    deleteConversation(db, conversationId);
    expect(getConversation(db, conversationId)).toBeNull();
  });

  it('should support pagination', () => {
    for (let i = 0; i < 5; i++) {
      createConversation(db, { title: `对话-${i}`, messages_json: '[]' });
    }
    const page1 = getConversations(db, 3, 0);
    const page2 = getConversations(db, 3, 3);
    expect(page1.length).toBe(3);
    expect(page2.length).toBe(2);
  });
});
