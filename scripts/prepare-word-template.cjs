/**
 * Prepare the factory deviation template for docxtemplater filling.
 * Replaces fixed placeholder texts with docxtemplater tags, then saves to
 * resources/templates/deviation-report-fillable.docx.
 *
 * Alignment with factory reports (D-TZ-API-EG-26002/26006):
 * - 签名表：起草人/审核人的部门、姓名 tag 化
 * - 偏差调查引导句：动态生成（{investigationIntro}），工厂写法为
 *   「发生偏差后，验证部验证人员XXX立即上报验证主管并通知分管QA，QA组织和协调...调查过程如下：」
 * - 删除模板中的大段指导文本（8项调查列表、调查工具说明、人员差错段落、
 *   重复偏差指导语、其他产品指导语、风险分析指导语）——工厂实际报告中均不存在
 * - 去除「分析：」「结论：」「最终的根本原因或最有可能的原因：」前缀
 * - 重复偏差/其他产品/风险分析：段落数组循环（{#xxxParagraphs}{.}{/xxxParagraphs}）
 * - 初步分析：条件标题「初步分析 Preliminary Analysis」（{#hasPreliminary}）
 * - 调查范围：3 列表格（类别/内容/风险点），表格化对齐 26006
 *
 * One-time script. Run: node scripts/prepare-word-template.cjs
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const SRC = path.resolve('resources/templates/deviation-report-template.docx');
const OUT = path.resolve('resources/templates/deviation-report-fillable.docx');

const zip = new PizZip(fs.readFileSync(SRC));
let xml = zip.file('word/document.xml').asText();
const log = [];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Replace all <w:t> occurrences whose exact text equals `old` (keeps w:t attrs). */
function replaceText(oldText, newText) {
  const re = new RegExp('(<w:t[^>]*>)' + escapeRegex(oldText) + '(<\\/w:t>)', 'g');
  const before = xml;
  xml = xml.replace(re, '$1' + newText + '$2');
  assert(xml !== before, 'replaceText did not match: ' + oldText.slice(0, 30));
  log.push('replaceText: ' + oldText.slice(0, 20) + ' -> ' + newText.slice(0, 20));
}

function findParagraph(anchor, occurrence = 0) {
  const runs = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)];
  const flow = runs.map((r) => r[1]).join('');
  let ts = flow.indexOf(anchor);
  // 跳过前 N 次出现（可用于避开目录/页眉中重复出现的锚点）
  for (let k = 0; k < occurrence && ts >= 0; k++) {
    ts = flow.indexOf(anchor, ts + anchor.length);
  }
  if (ts < 0) throw new Error('findParagraph NOT found in text flow -> ' + anchor.slice(0, 30));
  const te = ts + anchor.length;
  let acc = 0;
  let ri = -1;
  let rj = -1;
  for (let i = 0; i < runs.length; i++) {
    const end = acc + runs[i][1].length;
    if (ri < 0 && end > ts) ri = i;
    if (end >= te) { rj = i; break; }
    acc = end;
  }
  if (ri < 0 || rj < 0) throw new Error('findParagraph: run range not found -> ' + anchor.slice(0, 30));
  let paraStart = xml.lastIndexOf('<w:p', runs[ri].index);
  while (paraStart >= 0 && xml[paraStart + 4] !== ' ' && xml[paraStart + 4] !== '>') {
    paraStart = xml.lastIndexOf('<w:p', paraStart - 1);
  }
  const paraEndIdx = xml.indexOf('</w:p>', runs[rj].index + runs[rj][0].length);
  const paraEnd = paraEndIdx + '</w:p>'.length;
  if (paraStart < 0 || paraEndIdx < 0) throw new Error('findParagraph: para bounds not found -> ' + anchor.slice(0, 30));
  return xml.slice(paraStart, paraEnd);
}

/** Replace the whole paragraph containing `anchor` with a single-run paragraph (keeps pPr). */
function replaceParagraph(anchor, replacement) {
  const p = findParagraph(anchor);
  const pPr = (p.match(/<w:pPr>.*?<\/w:pPr>/s) || [''])[0];
  const rPr = (p.match(/<w:rPr>.*?<\/w:rPr>/s) || [''])[0];
  const run = `<w:r>${rPr}<w:t xml:space="preserve">${replacement}</w:t></w:r>`;
  xml = xml.replace(p, `<w:p>${pPr}${run}</w:p>`);
  log.push('replaceParagraph: ' + anchor.slice(0, 24) + ' -> {' + replacement.slice(0, 30) + '}');
}

/** Delete the whole paragraph containing `anchor`. */
function removeParagraph(anchor) {
  const p = findParagraph(anchor);
  xml = xml.replace(p, '');
  log.push('removeParagraph: ' + anchor.slice(0, 40));
}

function makeParagraph(text, indent) {
  const ind = indent ? '<w:ind w:firstLineChars="200" w:firstLine="420"/>' : '<w:ind w:left="0"/>';
  const run = `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="eastAsia"/><w:sz w:val="21" w:szCs="21"/><w:lang w:eastAsia="zh-CN"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
  return `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/>${ind}<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:pPr>${run}</w:p>`;
}

/** 生成加粗三级小标题段落（numId=5/ilvl=2 → %1.%2.%3，对齐「根本原因调查」下属标题体系，
 *  与工厂 26003R 的「初步分析 Preliminary Analysis」「全面调查Complete investigation」编号样式一致）。 */
function makeHeading(text) {
  const pPr = `<w:pPr><w:numPr><w:ilvl w:val="2"/><w:numId w:val="5"/></w:numPr><w:tabs><w:tab w:val="left" w:pos="567"/></w:tabs><w:spacing w:line="360" w:lineRule="auto"/><w:ind w:hanging="218"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:pPr>`;
  const run = `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
  return `<w:p>${pPr}${run}</w:p>`;
}

function insertBefore(anchor, paragraphs, occurrence = 0) {
  const p = findParagraph(anchor, occurrence);
  xml = xml.replace(p, paragraphs + p);
  log.push('insertBefore: ' + anchor.slice(0, 20));
}

function insertAfter(anchor, paragraphs, occurrence = 0) {
  const p = findParagraph(anchor, occurrence);
  xml = xml.replace(p, p + paragraphs);
  log.push('insertAfter: ' + anchor.slice(0, 20));
}

function getAllTables() {
  return [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/gs)].map((m) => m[0]);
}

function getRows(tblXml) {
  return [...tblXml.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/gs)].map((m) => m[0]);
}

function getCells(rowXml) {
  return [...rowXml.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/gs)].map((m) => m[0]);
}

/** Set a cell's content to a single run with `text` (keeps pPr, drops old runs). */
function cellSetText(tblIndex, rowIndex, cellIndex, text) {
  const tbls = getAllTables();
  const tblXml = tbls[tblIndex];
  const rows = getRows(tblXml);
  const rowXml = rows[rowIndex];
  const cells = getCells(rowXml);
  const cellXml = cells[cellIndex];
  const p = cellXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/s);
  assert(p, 'cellSetText: no paragraph in cell');
  const pPr = (p[0].match(/<w:pPr>[\s\S]*?<\/w:pPr>/s) || [''])[0];
  const rPr = (p[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/s) || [''])[0];
  const newP = `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const newCell = cellXml.replace(p[0], newP);
  const newRow = rowXml.replace(cellXml, newCell);
  const newTbl = tblXml.replace(rowXml, newRow);
  xml = xml.replace(tblXml, newTbl);
  log.push('cellSetText: tbl' + tblIndex + ' row' + rowIndex + ' cell' + cellIndex + ' <- ' + text.slice(0, 30));
}

/** Delete a table row. */
function removeRow(tblIndex, rowIndex) {
  const tbls = getAllTables();
  const tblXml = tbls[tblIndex];
  const rows = getRows(tblXml);
  const rowXml = rows[rowIndex];
  const newTbl = tblXml.replace(rowXml, '');
  xml = xml.replace(tblXml, newTbl);
  log.push('removeRow: tbl' + tblIndex + ' row' + rowIndex);
}

// ================= cover =================
replaceText('XX', '{title}');
replaceText('Deviation Investigation and Risk Assessment Report for XX', '{titleEn}');

// ================= signature table (Table 0) =================
// 26002/26006：起草人 = 验证部 + 姓名；审核人 = 验证部 + 姓名
cellSetText(0, 1, 1, '{preparedByDepartment}');
cellSetText(0, 1, 2, '{preparedByName}');
cellSetText(0, 2, 1, '{reviewedByDepartment}');
cellSetText(0, 2, 2, '{reviewedByName}');

// ================= background =================
replaceParagraph('偏差发生时的情况。', '{background}');

// ================= deviation investigation intro =================
// 26002/26006：「发生偏差后，验证部验证人员XXX立即上报XXX并通知分管QA，QA组织和协调...调查过程如下：」
replaceParagraph(
  '偏差发生部门组织涉及相关部门对偏差进行根源调查，调查过程可以参考但不仅限于以下内容：',
  '{investigationIntro}',
);

// ================= root cause investigation =================
// 删除大段指导文本（工厂实际报告中不存在）：8 项调查列表 + 调查工具说明 + 人员差错段落
const guidanceParagraphs = [
  '调查相关人员应从人、机、料、法、环、测等方面进行全面调查',
  '与偏差发生过程中涉及的人员面谈，可包括人员培训、SOP执行、责任心、对程序的知晓和熟练程度等；',
  '核查工艺规程、岗位操作法等SOP的清晰度和准确度；',
  '回顾相关分析方法、验证报告、产品年度质量回顾、设备校验记录、变更控制、历史数据、研发报告、验证情况等；',
  '调查其它可能与偏差相关联的批次；',
  '复核涉及批次的批记录、辅助记录、设备日志及设备维护保养记录等；',
  '复核相关的产品、物料、留样；',
  '回顾稳定性考察结果趋势；',
  '核查物料供应商情况，必要时访问或审计物料的供应商、设备或仪器的生产厂家；',
  '调查分析的方法包括但不仅限于以下内容：',
  '事件流程图：对偏差的发生阶段逐一进行调查分析，找出导致偏差发生的根本原因；',
  '鱼骨图：可从人、机、料、法、环、测等方面对偏差进行调查分析；',
  '头脑风暴：通过联想和讨论，找出所有可能的问题根源；',
  '当认为偏差是人员（Manpower）差错引起时',
];
for (const anchor of guidanceParagraphs) {
  removeParagraph(anchor);
}

// 初步分析：条件标题（{#hasPreliminary}）+ 段落循环（空时无标题无段落，兼容 26002 无标题/26006 有「初步分析」两种写法）
// 全面调查：恒显示标题（工厂 26003R 恒有「全面调查Complete investigation」）
// 调查范围：段落循环（模板无表格，26006 的表格是工厂手工加的，以模板为基准）
// 插入到「根本原因调查」标题之后、6 因素之前
insertAfter(
  'Root Cause Investigation',
  makeHeading('{#hasPreliminary}初步分析 Preliminary Analysis{/hasPreliminary}') +
    makeParagraph('{#preliminaryParagraphs}{.}{/preliminaryParagraphs}', true) +
    makeParagraph('{#scopeItems}调查范围：{category}；调查内容：{details}；识别风险点：{ruledInOut}{/scopeItems}', true) +
    makeHeading('全面调查Complete investigation') +
    makeParagraph('从人、机、料、法、环、测等方面进行全面调查：', false),
);

// 6 factor items, inserted before the root cause conclusion
insertBefore(
  '调查得出的结论是什么？',
  makeParagraph('{#factorItems}{label}', false) + makeParagraph('{content}{/factorItems}', true),
);
// root cause conclusion — 26002/26006 无「结论：」前缀，直接叙述
replaceParagraph('调查得出的结论是什么？', '{rootCauseConclusion}');

// ================= repeat deviation =================
// 删除指导语；分析/结论合并为段落循环（26002 仅一句「查看验证部近2年无类似现象的偏差。」）
removeParagraph('调查过程中应回顾24个月内，同一产品或同一类型，重复发生的相同现象偏差情况和CAPA有效性评估');
replaceParagraph('需要针对重复偏差输出额外的措施项等', '{#repeatParagraphs}{.}{/repeatParagraphs}');
removeParagraph('结论：历史回顾得出的结论是什么？');

// 空记录条件化：repeat 块（标题+表格+段落）由 {#repeatSection}..{/repeatSection} 包裹
insertBefore('重复偏差调查Repeat Deviation investigation', makeParagraph('{#repeatSection}'));
// repeat 结束段置于「其他产品或批次调查」标题前（other 起始段会在后续步骤插入其后再）
insertBefore('其他产品或批次调查', makeParagraph('{/repeatSection}'), 0);

// ================= other products =================
removeParagraph('偏差调查中应包括该偏差涉及到其他产品或批次的调查，必要时可参考如下表格列出相关信息：');
replaceParagraph('是否需要对涉及批次采取额外措施等', '{#otherParagraphs}{.}{/otherParagraphs}');
removeParagraph('结论：其他产品或批次调查得出的结论是什么？');

// 空结果条件化：other 块（标题+表格+段落）由 {#otherSection}..{/otherSection} 包裹
insertBefore('其他产品或批次调查', makeParagraph('{#otherSection}'), 0);
insertBefore('调查结论', makeParagraph('{/otherSection}'), 1);

// ================= investigation conclusion =================
// 26002/26006 无前缀，直接叙述
replaceParagraph('列出最终的根本原因或最有可能的原因。', '{finalRootCause}');

// ================= risk assessment =================
// 删除指导语，插入段落循环（analysis + summary 小结）
// occurrence=1：正文标题第二次出现（目录中同名条目优先匹配）
removeParagraph('评估偏差对产品的质量、稳定性、上市许可文件或注册文件、客户、验证有效性等方面存在的潜在影响。');
insertAfter(
  '风险分析及影响评估Risks Analysis and Impact Assessment',
  makeParagraph('{#riskParagraphs}{.}{/riskParagraphs}', true),
  1,
);

// ================= tables =================
// Table 2: repeat deviations (index 1) - row 1 becomes loop row
{
  cellSetText(1, 1, 0, '{#repeatRecords}{no}');
  cellSetText(1, 1, 1, '{time}');
  cellSetText(1, 1, 2, '{deviationNo}');
  cellSetText(1, 1, 3, '{description}');
  cellSetText(1, 1, 4, '{rootCause}');
  cellSetText(1, 1, 5, '{capa}{/repeatRecords}');
  log.push('Table2: repeat records loop row ready');
}

// Table 3: other products (index 2) - row 1 becomes loop row, rows 2-3 removed
{
  cellSetText(2, 1, 0, '{#otherRecords}{no}');
  cellSetText(2, 1, 1, '{productName}');
  cellSetText(2, 1, 2, '{batchNo}');
  cellSetText(2, 1, 3, '{currentStatus}{/otherRecords}');
  removeRow(2, 3);
  removeRow(2, 2);
  log.push('Table3: other records loop row ready');
}

// Table 4: CAPA (index 3) - row 1 = corrections loop, row 4 = preventions loop
{
  cellSetText(3, 1, 0, '{#corrections}{capaNo}');
  cellSetText(3, 1, 1, '{content}');
  cellSetText(3, 1, 2, '{executor}');
  cellSetText(3, 1, 3, '{expectedDate}');
  cellSetText(3, 1, 4, '{signatureDate}{/corrections}');
  removeRow(3, 2);
  cellSetText(3, 3, 0, '{#preventions}{capaNo}');
  cellSetText(3, 3, 1, '{content}');
  cellSetText(3, 3, 2, '{executor}');
  cellSetText(3, 3, 3, '{expectedDate}');
  cellSetText(3, 3, 4, '{signatureDate}{/preventions}');
  removeRow(3, 4);
  log.push('Table4: corrections + preventions loop rows ready');
}

// Table 5: attachments (index 4) - row 1 becomes loop row
{
  cellSetText(4, 1, 0, '{#attachments}调查报告-附件{no}');
  cellSetText(4, 1, 1, '{name}');
  cellSetText(4, 1, 2, '{pages}{/attachments}');
  log.push('Table5: attachments loop row ready');
}

// Table 6: version history (index 5) - row 1 becomes loop row
{
  cellSetText(5, 1, 0, '{#versionHistory}{version}');
  cellSetText(5, 1, 1, '{executionDate}');
  cellSetText(5, 1, 2, '{revisionReason}');
  cellSetText(5, 1, 3, '{mainChanges}{/versionHistory}');
  log.push('Table6: version history loop row ready');
}

// ================= header =================
// 页眉对齐工厂完成版（26003R）：标题/英文标题/文件编号/版本号动态填充。
// 页码保持模板原样（官方模板无 PAGE/NUMPAGES 域，工厂版为手工录入，不做伪造）。
{
  const docXml = xml;
  xml = zip.file('word/header1.xml').asText();
  replaceParagraph('XX偏差调查和风险评估报告', '{title}偏差调查和风险评估报告');
  replaceParagraph('Deviation Investigation and Risk Assessment Report for XX', '{titleEn}');
  replaceParagraph('文件编号：偏差编号-R', '文件编号：{fileNo}');
  replaceParagraph('版本号：', '版本号：{version}');
  zip.file('word/header1.xml', xml);
  xml = docXml;
  log.push('header: title/titleEn/fileNo/version tag-ified');
}

// ================= write output =================
zip.file('word/document.xml', xml);
fs.writeFileSync(OUT, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('written', OUT);
console.log(log.join('\n'));
