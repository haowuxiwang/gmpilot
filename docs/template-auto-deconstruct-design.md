# 用户上传偏差模板 — 自动解构与 Chunk 引擎设计方案

> 2026-08-27 · 核心目标：用户上传任意工厂的偏差报告 docx 模板，应用自动识别结构、切分模块、填充内容

## 一、核心理念

**当前问题**：预设模板方案需要为每个工厂维护一套模板文件，无法应对：
- 工厂 A 用 Arial，工厂 B 用 Times New Roman
- 工厂 A 风险在结论前，工厂 B 风险在结论后
- 工厂 A 有"批准人"签名，工厂 B 没有
- 工厂 A 用表格布局，工厂 B 用段落布局

**目标**：用户上传任意 docx 模板 → 应用自动解构 → 自动映射 7 个标准模块 → 填充内容并保留原格式

## 二、技术方案

### 2.1 整体流程

```
用户上传 .docx
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  1. 模板解析器 (TemplateParser)                          │
│     - 解压 docx → 读取 document.xml                      │
│     - 提取段落、表格、样式、字体、字号                      │
│     - 构建文档 AST（抽象语法树）                           │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  2. 章节识别器 (SectionDetector)                         │
│     - 扫描标题样式（Heading 1/2/3 或自定义样式）           │
│     - 关键词匹配（背景/调查/结论/风险/CAPA/附件）          │
│     - 编号识别（1. / 一、/ 1.1 / A.）                    │
│     - 输出：section[] = { moduleId, startPara, endPara } │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  3. 标签注入器 (TagInjector)                             │
│     - 在识别到的章节边界插入 docxtemplater 标签           │
│     - 处理段落循环 {#riskParagraphs}{.} {/}              │
│     - 处理条件显示 {#hasPreliminary}...{/}               │
│     - 处理表格行循环 {#corrections}...{/}                │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  4. 内容填充器 (ContentFiller)                           │
│     - 复用现有 buildDocxData() 生成结构化数据             │
│     - docxtemplater 渲染                                 │
│     - 输出保留原模板格式的 docx                           │
└─────────────────────────────────────────────────────────┘
```

### 2.2 章节识别算法

```typescript
// 模块关键词映射（支持中英文 + 同义词）
const MODULE_KEYWORDS = {
  cover: ['封面', '标题', 'title', 'cover', '报告编号'],
  background: ['背景', 'background', '偏差情况', '事件描述', '发生经过'],
  investigation: ['调查', 'investigation', '原因分析', '根因', '6M', '5M1E', '人料机法环'],
  conclusion: ['结论', 'conclusion', '调查结论', '根本原因', '根因结论'],
  riskAssessment: ['风险', 'risk', '风险评估', '影响评估', '风险分析'],
  capa: ['纠正', '预防', 'CAPA', '纠正措施', '预防措施', 'action'],
  attachments: ['附件', 'attachment', '清单', '附录'],
};

// 识别算法
function detectSections(paragraphs: Paragraph[]): Section[] {
  const sections: Section[] = [];
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const text = para.text.trim();
    
    // 1. 检查是否为标题（样式名含 Heading 或编号模式）
    const isHeading = isHeadingStyle(para.style) || hasNumberingPattern(text);
    
    if (!isHeading) continue;
    
    // 2. 关键词匹配，计算每个模块的匹配分数
    const scores = scoreModuleMatch(text);
    const bestMatch = getBestMatch(scores);
    
    if (bestMatch.score > THRESHOLD) {
      sections.push({
        moduleId: bestMatch.moduleId,
        startIndex: i,
        title: text,
        titleStyle: para.style,
      });
    }
  }
  
  // 3. 计算每个 section 的结束位置（下一个 section 的开始或文档末尾）
  for (let i = 0; i < sections.length; i++) {
    sections[i].endIndex = sections[i + 1]?.startIndex ?? paragraphs.length;
  }
  
  return sections;
}
```

### 2.3 标签注入策略

根据章节内容类型，注入不同的 docxtemplater 标签：

| 内容类型 | 注入方式 | 示例 |
|---|---|---|
| 单段文本 | 直接替换为 `{field}` | `{background}` |
| 多段文本 | 段落循环 | `{#riskParagraphs}{.} {/riskParagraphs}` |
| 表格行 | 行循环 | `{#corrections}{capaNo} {content} {/}` |
| 条件显示 | 条件标签 | `{#hasPreliminary}初步分析：{/}` |
| 列表项 | 段落循环 | `{#scopeItems}{category}: {details} {/}` |

### 2.4 格式保留机制

**核心原则**：docxtemplater 只替换标签所在 `<w:r>`（run）的文本，不改变段落样式、字体、字号、缩进。

- 段落样式（Heading 1/2/3、Normal）→ 保留
- 字体（Arial/Times New Roman/宋体）→ 保留
- 字号（五号/小四/四号）→ 保留
- 缩进（首行缩进/左缩进）→ 保留
- 表格结构（行列数、合并单元格）→ 保留

## 三、实施计划

### Phase 1：模板解析器

| 步骤 | 内容 | 文件 |
|---|---|---|
| 1.1 | docx 解压与 XML 解析 | core/template-engine/parser.ts |
| 1.2 | 段落/表格/样式提取 | core/template-engine/parser.ts |
| 1.3 | 文档 AST 构建 | core/template-engine/ast.ts |

### Phase 2：章节识别器

| 步骤 | 内容 | 文件 |
|---|---|---|
| 2.1 | 标题样式检测 | core/template-engine/detector.ts |
| 2.2 | 关键词匹配引擎 | core/template-engine/detector.ts |
| 2.3 | 模块映射输出 | core/template-engine/detector.ts |

### Phase 3：标签注入器

| 步骤 | 内容 | 文件 |
|---|---|---|
| 3.1 | 段落内容注入 | core/template-engine/injector.ts |
| 3.2 | 表格行注入 | core/template-engine/injector.ts |
| 3.3 | 条件标签注入 | core/template-engine/injector.ts |

### Phase 4：上传接口 + UI

| 步骤 | 内容 | 文件 |
|---|---|---|
| 4.1 | 上传 IPC handler | electron/ipc/template-engine.ts |
| 4.2 | preload 桥接 | electron/preload.ts |
| 4.3 | 上传 UI + 预览 | src/components/settings/TemplateUpload.tsx |

### Phase 5：测试

| 步骤 | 内容 | 文件 |
|---|---|---|
| 5.1 | 多工厂模板测试 | core/template-engine/__tests__/ |
| 5.2 | 格式保留验证 | e2e/pages/template-upload.spec.ts |

## 四、向后兼容

- 默认模板（当前 `deviation-report-fillable.docx`）作为 fallback
- 用户未上传模板 → 使用默认模板
- 用户上传模板 → 自动解构 + 填充
- 解构失败 → 回退到默认模板 + 提示用户

## 五、风险与缓解

| 风险 | 缓解 |
|---|---|
| 章节识别失败 | 提供手动映射 UI，用户可拖拽匹配 |
| 模板格式过于复杂 | 支持 .docx 和 .dotx，不支持宏 |
| 标签注入破坏 XML | 注入前备份，失败自动回滚 |
| 表格布局识别困难 | 优先识别表格头关键词 |
