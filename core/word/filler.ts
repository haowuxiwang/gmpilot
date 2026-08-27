/**
 * Word template filler.
 * Fills the factory deviation report template (docx) with generated report data
 * using docxtemplater. Runs in the Electron main process only (via IPC).
 * 用 docxtemplater 将生成的偏差报告数据填充到工厂 Word 模板中。
 * 
 * 支持多模板：通过 templateId 参数选择不同工厂的模板。
 */

import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { createLogger } from '../utils/logger';
import type { DeviationReport } from '../workflow/types';
import { getSelectedTemplate } from '../template/registry';

const log = createLogger('Word');

/** Flattened data shape consumed by the docx template tags */
export interface DocxFillData {
  title: string;
  titleEn: string;
  fileNo: string;
  version: string;
  preparedByDepartment: string;
  preparedByName: string;
  reviewedByDepartment: string;
  reviewedByName: string;
  background: string;
  investigationIntro: string;
  hasPreliminary: boolean;
  preliminaryParagraphs: string[];
  scopeItems: Array<{ category: string; details: string; ruledInOut: string }>;
  factorItems: Array<{ label: string; content: string }>;
  rootCauseConclusion: string;
  repeatParagraphs: string[];
  repeatSection: boolean;
  repeatRecords: Array<{
    no: string;
    time: string;
    deviationNo: string;
    description: string;
    rootCause: string;
    capa: string;
  }>;
  otherParagraphs: string[];
  otherSection: boolean;
  otherRecords: Array<{ no: string; productName: string; batchNo: string; currentStatus: string }>;
  finalRootCause: string;
  riskParagraphs: string[];
  corrections: Array<{ capaNo: string; content: string; executor: string; expectedDate: string; signatureDate: string }>;
  preventions: Array<{ capaNo: string; content: string; executor: string; expectedDate: string; signatureDate: string }>;
  attachments: Array<{ no: string; name: string; pages: string }>;
  versionHistory: Array<{ version: string; executionDate: string; revisionReason: string; mainChanges: string }>;
}

/** 从完整标题中剥离「偏差调查和风险评估报告」后缀，得到模板占位符需要的对象名。
 *  用 lastIndexOf 定位后缀，容忍标题末尾带句号/空格/其他字符的变体，
 *  避免 Word 输出重复后缀。 */
function extractTitleObject(fullTitle: string): string {
  const cleaned = (fullTitle ?? '').trim();
  if (!cleaned) return '';
  const suffix = '偏差调查和风险评估报告';
  const idx = cleaned.lastIndexOf(suffix);
  if (idx >= 0) {
    // idx === 0 表示标题本身就是「偏差调查和风险评估报告」，无偏差对象 → 返回空
    return cleaned.slice(0, idx).trim();
  }
  return cleaned;
}

/** 将文本按换行拆分为段落数组（去除空段） */
function toParagraphs(text: string | undefined | null): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Map the assembled DeviationReport to the flat docx template data shape.
 * 将报告各模块输出映射为模板标签所需的数据结构。
 */
export function buildDocxData(report: DeviationReport): DocxFillData {
  const { cover, background, investigation, conclusion, riskAssessment, capa } = report;
  const rootCause = investigation?.rootCause ?? {};
  const factors = rootCause.factors ?? ({} as Record<string, string>);
  const repeat = investigation?.repeatDeviations ?? {};
  const other = investigation?.otherProducts ?? {};

  // 6 因素顺序对齐工厂 26003/26006：人 → 设备 → 方法 → 物料 → 环境 → 测量
  const factorItems = [
    { label: '人员', content: factors.man ?? '' },
    { label: '设备', content: factors.machine ?? '' },
    { label: '方法', content: factors.method ?? '' },
    { label: '物料', content: factors.material ?? '' },
    { label: '环境', content: factors.environment ?? '' },
    { label: '测量', content: factors.measurement ?? '' },
  ];

  // 背景优先使用详细描述（LLM 生成的完整叙述），缺失时拼接结构化字段
  const bgParts = [background?.occurrenceTime, background?.location, background?.product, background?.batch].filter(Boolean);
  const backgroundText =
    background?.description?.trim() || bgParts.join('，') || '待补充';

  // 根本原因调查结论
  const rootCauseConclusion = rootCause.conclusion || '待补充';

  // 重复偏差分析/结论 → 段落数组（26002 写法：「查看验证部近2年无类似现象的偏差。」）
  const repeatParagraphs = toParagraphs([repeat.analysis, repeat.conclusion].join('\n'));
  // 重复偏差整块可见性：记录或分析段落任一非空才显示（避免空白表头）
  const repeatSection = (repeat.records?.length ?? 0) > 0 || repeatParagraphs.length > 0;
  // 其他产品分析/结论 → 段落数组（26002 写法：「不涉及。」）
  const otherParagraphs = toParagraphs([other.analysis, other.conclusion].join('\n'));
  // 其他产品整块可见性：同 repeat
  const otherSection = (other.records?.length ?? 0) > 0 || otherParagraphs.length > 0;

  // 风险分析：叙述段 + 小结段
  const riskParagraphs = [
    ...toParagraphs(riskAssessment?.description),
    ...toParagraphs(riskAssessment?.summary),
  ];

  const finalRootCause = conclusion?.rootCause || conclusion?.mostLikelyCause || '待补充';

  return {
    title: extractTitleObject(cover?.title || ''),
    titleEn: cover?.titleEn || '',
    // 页眉文件编号：偏差编号 + -R（对齐工厂 26003R「文件编号：D-TZ-API-EG-26003-R」）
    fileNo: report.deviationId ? `${report.deviationId}-R` : '',
    // 页眉版本号：取版本历史首条（工厂 26003R 为「00」）
    version: report.versionHistory?.[0]?.version ?? '',
    preparedByDepartment: cover?.preparedBy?.department || cover?.department || '待补充',
    preparedByName: cover?.preparedBy?.name || '',
    reviewedByDepartment: cover?.reviewedBy?.department || cover?.department || '待补充',
    reviewedByName: cover?.reviewedBy?.name || '',
    background: backgroundText,
    investigationIntro: investigation?.investigationIntro || '',
    // 「初步分析 Preliminary Analysis」标题可见性：分析段落或调查范围任一非空
    hasPreliminary:
      toParagraphs(rootCause.preliminaryAnalysis).length > 0 || (rootCause.investigationScope?.length ?? 0) > 0,
    preliminaryParagraphs: toParagraphs(rootCause.preliminaryAnalysis),
    scopeItems: rootCause.investigationScope ?? [],
    factorItems,
    rootCauseConclusion,
    repeatParagraphs,
    repeatSection,
    repeatRecords: repeat.records ?? [],
    otherParagraphs,
    otherSection,
    otherRecords: other.records ?? [],
    finalRootCause,
    riskParagraphs,
    corrections: capa?.corrections ?? [],
    preventions: capa?.preventions ?? [],
    attachments: report.attachments ?? [],
    versionHistory: report.versionHistory ?? [],
  };
}

/**
 * Render the fillable template with the given data.
 * @param data - The fill data
 * @param templateId - Optional template ID (uses settings selection or default if not provided)
 * Returns the generated docx as a Buffer.
 */
export function renderTemplate(data: DocxFillData, templateId?: string): Buffer {
  const template = getSelectedTemplate(templateId);
  const templatePath = template.fillablePath;

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Word 模板不存在: ${templatePath}`);
  }

  const zip = new PizZip(fs.readFileSync(templatePath));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  log.info('Word template rendered', { templateId: template.id, size: buffer.length });
  return buffer;
}

/**
 * Fill the template and write to outputPath.
 * 生成填充后的 Word 报告并写入指定路径。
 * @param report - The deviation report
 * @param outputPath - Output file path
 * @param templateId - Optional template ID
 */
export function exportDocxToFile(report: DeviationReport, outputPath: string, templateId?: string): string {
  const data = buildDocxData(report);
  const buffer = renderTemplate(data, templateId);
  fs.writeFileSync(outputPath, buffer);
  log.info('Word report exported', { outputPath, size: buffer.length, templateId });
  return outputPath;
}

/** Resolve the default export filename for a report. */
export function defaultDocxFileName(report: DeviationReport): string {
  const base = report.title?.replace(/[/\\:*?"<>|]/g, '_') || report.deviationId || '偏差报告';
  return `${base}.docx`;
}
