/**
 * Word 导出与工厂模板一致性验证。
 * 解包两个 docx，比对：
 *  1. 字体声明（正文应为 Arial + 宋体 eastAsia）
 *  2. 字号（五号 = sz 21 half-points = 10.5pt）
 *  3. 章节标题齐全（按段落文本匹配——标题常跨多个 w:t run，不能直接对 XML 正则）
 *
 * 用法: npx tsx scripts/verify-word-export.ts [exported.docx]
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const FACTORY = path.resolve('resources/templates/deviation-report-fillable.docx');
const exported = process.argv[2];

function extractDocx(docxPath: string): { xml: string; paragraphText: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
  execSync(`unzip -o -q "${docxPath}" -d "${tmp}"`, { stdio: 'pipe' });
  const doc = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf-8');
  const styles = fs.readFileSync(path.join(tmp, 'word', 'styles.xml'), 'utf-8');
  // 按段落拼接文本（标题跨 w:t run 时必须先拼段再匹配）
  const paragraphText = doc
    .split(/<\/w:p>/)
    .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))
    .join('\n');
  return { xml: doc + '\n===STYLES===\n' + styles, paragraphText };
}

let failures = 0;
function check(label: string, found: boolean, expect: boolean): boolean {
  const ok = found === expect;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` (expected ${expect ? 'present' : 'absent'}, got ${found ? 'present' : 'absent'})`}`);
  if (!ok) failures++;
  return ok;
}

// 工厂模板实际章节标题（目录页）
const SECTIONS = [
  '背景 Background',
  '偏差调查',
  '调查结论',
  '风险分析及影响评估',
  '纠正预防措施 CAPA',
  '附件清单',
  '版本修订历史',
];

console.log('=== 工厂模板基线:', path.basename(FACTORY), '===');
const factory = extractDocx(FACTORY);
check('字体 Arial', /w:ascii="Arial"/.test(factory.xml), true);
check('中文 宋体', /w:eastAsia="宋体"/.test(factory.xml), true);
check('字号 五号 (sz=21)', /w:sz w:val="21"/.test(factory.xml), true);
for (const sec of SECTIONS) check(`章节「${sec}」`, factory.paragraphText.includes(sec), true);

if (exported) {
  console.log('\n=== 导出文件:', path.basename(exported), '===');
  if (!fs.existsSync(exported)) {
    console.error('文件不存在:', exported);
    process.exit(1);
  }
  const ex = extractDocx(exported);

  check('字体 Arial', /w:ascii="Arial"/.test(ex.xml), true);
  check('中文 宋体', /w:eastAsia="宋体"/.test(ex.xml), true);
  check('字号 五号 (sz=21)', /w:sz w:val="21"/.test(ex.xml), true);
  check('无残留占位符 {{...}}', /\{\{[a-zA-Z_]+\}\}/.test(ex.xml), false);
  for (const sec of SECTIONS) check(`章节「${sec}」`, ex.paragraphText.includes(sec), true);

  // 字体一致性：导出物不应引入工厂模板没有的新字体（等线除外，Word 默认主题字体）
  const fontsOf = (xml: string) => new Set((xml.match(/w:ascii="[^"]*"/g) || []));
  const extraFonts = [...fontsOf(ex.xml)].filter((f) => !fontsOf(factory.xml).has(f));
  if (extraFonts.length > 0) {
    console.log(`✗ 引入了工厂模板没有的字体: ${extraFonts.join(', ')}`);
    failures++;
  } else {
    console.log('✓ 无多余字体引入');
  }
} else {
  console.log('\n（未提供导出文件路径，仅完成基线校验）');
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\nFAILED: ${failures} checks`);
process.exit(failures === 0 ? 0 : 1);
