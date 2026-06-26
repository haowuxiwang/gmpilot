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
});
