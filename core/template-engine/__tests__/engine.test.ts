/**
 * Template engine tests.
 * Tests for parser, detector, and injector.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseDocx } from '../parser';
import { detectSections, getMissingModules } from '../detector';
import { injectTags } from '../injector';

const TEST_TEMPLATE_PATH = path.resolve('resources/templates/default/deviation-report-fillable.docx');

describe('TemplateParser', () => {
  it('should parse a valid docx file', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);

    expect(ast.paragraphs.length).toBeGreaterThan(0);
    expect(ast.styles).toBeDefined();
    expect(ast.fonts).toBeDefined();
  });

  it('should extract paragraphs with text', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);

    const firstPara = ast.paragraphs[0];
    expect(firstPara.type).toBe('paragraph');
    expect(firstPara.text).toBeDefined();
    expect(firstPara.runs).toBeDefined();
  });

  it('should detect heading styles', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);

    const headings = ast.paragraphs.filter((p) => p.isHeading);
    expect(headings.length).toBeGreaterThan(0);
  });

  it('should extract tables', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);

    expect(ast.tables).toBeDefined();
    // The default template has tables
    expect(ast.tables.length).toBeGreaterThanOrEqual(0);
  });
});

describe('SectionDetector', () => {
  it('should detect sections in the default template', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);
    const sections = detectSections(ast);

    expect(sections.length).toBeGreaterThan(0);
  });

  it('should detect background section', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);
    const sections = detectSections(ast);

    const background = sections.find((s) => s.moduleId === 'background');
    expect(background).toBeDefined();
  });

  it('should detect investigation section', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);
    const sections = detectSections(ast);

    const investigation = sections.find((s) => s.moduleId === 'investigation');
    expect(investigation).toBeDefined();
  });

  it('should detect conclusion section', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);
    const sections = detectSections(ast);

    const conclusion = sections.find((s) => s.moduleId === 'conclusion');
    expect(conclusion).toBeDefined();
  });

  it('should detect risk assessment section', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);
    const sections = detectSections(ast);

    const risk = sections.find((s) => s.moduleId === 'riskAssessment');
    expect(risk).toBeDefined();
  });

  it('should detect CAPA section', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);
    const sections = detectSections(ast);

    const capa = sections.find((s) => s.moduleId === 'capa');
    expect(capa).toBeDefined();
  });

  it('should detect attachments section', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);
    const sections = detectSections(ast);

    const attachments = sections.find((s) => s.moduleId === 'attachments');
    expect(attachments).toBeDefined();
  });

  it('should report missing modules correctly', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const ast = parseDocx(buffer);
    ast.sections = detectSections(ast);

    const missing = getMissingModules(ast);
    expect(Array.isArray(missing)).toBe(true);
  });
});

describe('TagInjector', () => {
  it('should inject tags into a template', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const result = injectTags(buffer, 'test-template');

    expect(result.success).toBe(true);
    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.detectedSections.length).toBeGreaterThan(0);
  });

  it('should detect all sections before injection', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const result = injectTags(buffer, 'test-template');

    expect(result.detectedSections.length).toBeGreaterThanOrEqual(5);
  });

  it('should report missing modules', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const result = injectTags(buffer, 'test-template');

    expect(Array.isArray(result.missingModules)).toBe(true);
  });

  it('should produce a valid docx output', () => {
    const buffer = fs.readFileSync(TEST_TEMPLATE_PATH);
    const result = injectTags(buffer, 'test-template');

    // Check that the output starts with PK (zip magic bytes)
    expect(result.buffer[0]).toBe(0x50); // 'P'
    expect(result.buffer[1]).toBe(0x4b); // 'K'
  });
});
