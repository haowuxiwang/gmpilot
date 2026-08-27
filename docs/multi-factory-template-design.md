# GMPilot 多工厂偏差模板适配方案

> 2026-08-27 · 调研 + 设计 + 实施计划
> 目标：支持不同工厂的偏差报告模板（字体/字号/缩进/章节结构/页眉页脚）

## 一、当前架构定位

### 1.1 模板系统组成

```
┌─────────────────────────────────────────────────────────┐
│  当前架构（单一 Word 模板）                                │
├─────────────────────────────────────────────────────────┤
│  LLM 提示词模板（docs/templates/*.md）                    │
│    ├── background.md          ← 7 个模块提示词            │
│    ├── investigation-root-cause.md                       │
│    ├── conclusion.md                                     │
│    ├── risk-assessment.md                                 │
│    ├── capa.md                                           │
│    ├── attachments.md                                    │
│    └── cover.md                                          │
│                                                          │
│  Word 输出模板（resources/templates/）                    │
│    └── deviation-report-fillable.docx  ← 唯一模板        │
│         字体：Arial + 宋体（硬编码）                       │
│         字号：五号 sz=21（硬编码）                         │
│         缩进：首行缩进 2 字符（硬编码）                    │
│         章节：7 节固定顺序（硬编码）                       │
└─────────────────────────────────────────────────────────┘
```

### 1.2 硬编码问题清单

| 硬编码项 | 当前值 | 影响 |
|---|---|---|
| 字体（正文） | Arial | 有的工厂要 Times New Roman |
| 字体（中文） | 宋体 | 有的工厂要黑体/仿宋 |
| 字号 | 五号 sz=21 (10.5pt) | 有的工厂要小四 12pt |
| 首行缩进 | 2 字符 | 有的工厂不要缩进 |
| 章节顺序 | 背景→调查→结论→风险→CAPA | 有的工厂要风险在结论前 |
| 页眉文件编号 | `{deviationId}-R` | 不同工厂编号格式不同 |
| 签名表结构 | 起草人/审核人 | 有的工厂要批准人 |

### 1.3 核心结论

**当前系统无法适配不同工厂的模板差异**。Word 模板是单一文件，所有样式硬编码在 docx 的 XML 中。

---

## 二、调研结论

### 2.1 成熟方案对比

| 方案 | 代表产品 | 灵活性 | 实现成本 | 适用场景 |
|---|---|---|---|---|
| 多模板文件 + 注册表 | Docmosis | ★★★☆ | ★★☆☆ | 预设少量模板 |
| 单一模板 + 样式覆盖 | 自定义 | ★★★★ | ★★★★ | 样式差异大 |
| 模板注册表 + 用户上传 | Docxtemplater | ★★★★★ | ★★★☆ | 多工厂自定义 |
| 在线模板编辑器 | Templafy | ★★★★★ | ★★★★★ | 企业级 SaaS |

### 2.2 推荐方案：预设模板 + 用户上传（混合方案）

```
┌─────────────────────────────────────────────────────────┐
│  目标架构（多模板注册表）                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  TemplateRegistry（模板注册表）                   │    │
│  │  ├── default（内置默认）                          │    │
│  │  ├── factory-a（内置预设 A）                      │    │
│  │  ├── factory-b（内置预设 B）                      │    │
│  │  └── user-uploaded（用户上传）                    │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  TemplateResolver（模板解析器）                   │    │
│  │  1. 读取 settings.selectedTemplate               │    │
│  │  2. 查找对应模板文件                              │    │
│  │  3. 加载样式配置（style.json）                    │    │
│  │  4. 传递给 filler 填充                            │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  WordFiller（填充器，支持样式覆盖）                │    │
│  │  - 基础：docxtemplater 标签替换                   │    │
│  │  - 可选：动态修改 styles.xml（字体/字号）          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 三、详细设计

### 3.1 模板目录结构

```
resources/templates/
├── default/                          ← 内置默认模板
│   ├── deviation-report.docx         ← 填充后的模板
│   ├── deviation-report-fillable.docx ← 带占位符的模板
│   ├── style.json                    ← 样式配置
│   └── meta.json                     ← 元数据（名称/版本/描述）
│
├── factory-a/                        ← 预设工厂 A（Times New Roman + 小四）
│   ├── deviation-report-fillable.docx
│   ├── style.json
│   └── meta.json
│
├── factory-b/                        ← 预设工厂 B（黑体 + 四号）
│   ├── deviation-report-fillable.docx
│   ├── style.json
│   └── meta.json
│
└── user/                             ← 用户上传模板
    └── {timestamp}-custom/
        ├── deviation-report-fillable.docx
        ├── style.json
        └── meta.json
```

### 3.2 样式配置（style.json）

```json
{
  "name": "默认模板",
  "version": "1.0.0",
  "description": "Arial + 宋体，五号字，适用大多数工厂",
  "fonts": {
    "ascii": "Arial",
    "eastAsia": "宋体",
    "headings": "Arial"
  },
  "sizes": {
    "body": 21,
    "heading1": 32,
    "heading2": 26,
    "heading3": 24
  },
  "indent": {
    "firstLine": 420,
    "left": 0
  },
  "spacing": {
    "line": 360,
    "before": 0,
    "after": 120
  },
  "sections": [
    "cover",
    "background",
    "investigation",
    "conclusion",
    "riskAssessment",
    "capa",
    "attachments"
  ],
  "header": {
    "fileNoFormat": "{deviationId}-R",
    "showLogo": false
  },
  "footer": {
    "signers": ["preparedBy", "reviewedBy"]
  }
}
```

### 3.3 模板注册表（TemplateRegistry）

```typescript
interface TemplateMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  builtIn: boolean;
  path: string;           // 模板目录路径
  stylePath: string;      // style.json 路径
  createdAt: string;
  updatedAt: string;
}

interface TemplateRegistry {
  getAll(): TemplateMeta[];
  getById(id: string): TemplateMeta | null;
  getDefault(): TemplateMeta;
  register(meta: TemplateMeta): void;      // 用户上传
  unregister(id: string): void;
}
```

### 3.4 设置页扩展

在 LLMConfig 下方新增"报告模板"卡片：

```
┌─────────────────────────────────────────┐
│  报告模板                                │
│  ─────────────────────────────────────  │
│  ○ 默认模板（Arial + 宋体，五号）        │
│  ○ 工厂 A（Times New Roman + 小四）      │
│  ○ 工厂 B（黑体 + 四号）                 │
│  ○ 自定义模板                            │
│                                         │
│  [上传自定义模板]                        │
│                                         │
│  预览：[模板缩略图/描述]                  │
└─────────────────────────────────────────┘
```

### 3.5 填充流程改造

```
原流程：
  report → buildDocxData() → renderTemplate(data) → output.docx
                         ↑
              FILLABLE_TEMPLATE_PATH（硬编码）

新流程：
  report → buildDocxData() → renderTemplate(data, templateId) → output.docx
                         ↑
              TemplateRegistry.getById(templateId)
                         ↑
              settings.selectedTemplate || 'default'
```

---

## 四、实施计划

### Phase 1：模板注册表 + 样式配置（基础）

| 步骤 | 内容 | 文件 |
|---|---|---|
| 1.1 | 创建 TemplateRegistry 类 | core/template/registry.ts |
| 1.2 | 定义 TemplateMeta / StyleConfig 类型 | core/template/types.ts |
| 1.3 | 扫描 resources/templates/ 目录 | core/template/registry.ts |
| 1.4 | 加载 style.json 配置 | core/template/style-loader.ts |
| 1.5 | 修改 filler.ts 支持传入 templateId | core/word/filler.ts |

### Phase 2：预设模板 + 用户上传（扩展）

| 步骤 | 内容 | 文件 |
|---|---|---|
| 2.1 | 创建 factory-a / factory-b 预设模板 | resources/templates/ |
| 2.2 | 实现用户上传模板 IPC | electron/ipc/template.ts |
| 2.3 | 模板验证（检查必需占位符） | core/template/validator.ts |
| 2.4 | 设置页"报告模板"卡片 | src/components/settings/TemplateConfig.tsx |

### Phase 3：样式动态覆盖（高级）

| 步骤 | 内容 | 文件 |
|---|---|---|
| 3.1 | 填充后修改 styles.xml 字体 | core/word/style-override.ts |
| 3.2 | 字号动态调整 | core/word/style-override.ts |
| 3.3 | 缩进动态调整 | core/word/style-override.ts |
| 3.4 | 章节顺序重排 | core/word/section-order.ts |

### Phase 4：测试 + 文档

| 步骤 | 内容 | 文件 |
|---|---|---|
| 4.1 | 多模板切换单元测试 | core/template/__tests__/ |
| 4.2 | 模板验证测试 | core/template/__tests__/ |
| 4.3 | 样式覆盖测试 | core/word/__tests__/ |
| 4.4 | e2e 多模板导出测试 | e2e/pages/template.spec.ts |
| 4.5 | 模板上传使用文档 | docs/template-upload-guide.md |

---

## 五、关键决策点

### 5.1 样式覆盖策略

| 策略 | 优点 | 缺点 |
|---|---|---|
| A. 多套完整模板 | 实现简单，样式精确 | 模板数量多，维护成本高 |
| B. 单模板 + 动态修改 XML | 灵活，一个模板走天下 | 实现复杂，边界情况多 |
| **C. 混合（推荐）** | 预设覆盖大多数，动态修改兜底 | 适中 |

**推荐 C**：内置 2-3 套预设模板（覆盖 80% 工厂），极端情况走动态 XML 修改。

### 5.2 用户上传验证

用户上传模板必须包含以下占位符，否则拒绝：
- `{title}` `{titleEn}` `{fileNo}` `{version}`
- `{background}` `{investigationIntro}` `{rootCauseConclusion}`
- `{riskParagraphs}` `{corrections}` `{preventions}`

### 5.3 向后兼容

- `settings.selectedTemplate` 不存在时，默认使用 `'default'`
- 旧版单模板路径 `resources/templates/deviation-report-fillable.docx` 保留为 default

---

## 六、验收标准

- [ ] 可在设置页切换 3 套预设模板
- [ ] 切换后生成的报告字体/字号/缩进符合配置
- [ ] 支持用户上传自定义 .docx 模板
- [ ] 上传时验证必需占位符
- [ ] 旧项目无 selectedTemplate 设置时自动使用 default
- [ ] 所有现有测试通过（不破坏原有功能）
- [ ] e2e 多模板导出测试通过

---

## 七、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 用户上传模板缺占位符 | 生成空白报告 | 上传时强制验证 |
| 动态修改 XML 破坏模板 | 输出乱码 | 预设模板优先，动态修改仅兜底 |
| 多模板增加包体积 | 安装包变大 | 预设模板压缩，用户模板按需下载 |
| 旧项目迁移 | 用户报告格式变化 | 默认模板与旧版完全一致 |
