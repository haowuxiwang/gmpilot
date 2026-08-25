# 前端视觉改造交接文档

> 本文档供「有视觉能力的模型」接手前端改造任务时使用。记录了设计方向、已完成改动、进行中任务、验证方式。

## 任务背景

GMPilot（制药 GMP 偏差报告生成桌面应用，Electron + React + Tailwind v4）前端视觉改造。
用户反馈主页**信息密度大**，希望**极简、无 logo、重动效/卡片/按钮/折叠**。

## 已确认的设计决策（不可推翻）

| 决策 | 内容 |
|---|---|
| 设计方向 | A「临床冷静风」（Calm Editorial）：暖灰 stone 基底 + teal 品牌色 + 状态色只表含义 |
| 暗色模式 | **不做**（用户明确砍掉，侧边栏主题切换按钮已删除） |
| 中性色 | **真暖灰 stone**（`#fafaf9` 起，已替换原 zinc 冷灰） |
| 品牌 | **无 logo**，侧边栏品牌区已删除 |
| 字体 | 报告区（DocumentViewer）用 **Noto Serif CJK SC 衬线**（与 PDF 导出同一字体文件） |
| 主页排版 | **方案 A 两栏收敛**：主页默认「导航 + 聊天区」，历史对话收进浮层，文档面板自动滑出 |
| 动效偏好 | 卡片 hover 微动效、折叠双向动画、GSAP 入场；折叠是核心交互诉求 |

## 已完成改动（本轮，已验证 typecheck + lint 通过）

### 1. `src/index.css` — 设计令牌
- stone 全系换真暖灰：`#fafaf9/#f5f5f4/#e7e5e4/#d6d3d1/#a8a29e/#78716c/#57534e/#44403c/#292524/#1c1917`
- 新增 `--font-serif: 'Noto Serif CJK SC', ...`（font-serif utility 可用）
- 新增折叠动画工具类：
  - `.collapse-grid`（grid-template-rows 0fr↔1fr 双向过渡，配合 `data-open` 属性）
  - `.chevron-rotate`（chevron 旋转 90°，配合 `data-open`）

### 2. 渲染进程衬线字体加载链路（已完成）
- `electron/main.ts`：CSP `font-src` 加了 `file:`
- `electron/preload.ts`：暴露 `window.gmpilot.resources.getFontPath()`
- `electron/ipc/file.ts`：新增 `resources:getFontPath` handler（返回 `process.resourcesPath/resources/fonts/NotoSerifCJKsc-Regular.otf`）
- `src/components/document/DocumentViewer.tsx`：`loadSerifFont()` 模块级 FontFace 动态注册，**失败优雅降级系统衬线**（dev 环境 http:// 加载 file:// 字体会被 CORS 拦，属预期）

### 3. `src/components/layout/Sidebar.tsx` — 无 logo 极简 + 可折叠
- 删除品牌区（GMPilot 标题）
- 删除主题切换按钮（Sun/Monitor）
- **可折叠 240px ↔ 48px**（`transition-[width] duration-300`），折叠后只显图标 + tooltip
- 底部 LLM 状态徽章保留（展开时文字 + 折叠时只留圆点），折叠按钮在底部

### 4. `src/components/ui/button.tsx` — primary 纯色化
- 从渐变 + 发光（`bg-gradient-to-br from-teal-600...`）改为 `bg-teal-600 hover:bg-teal-700 + shadow-sm`

### 5. `src/components/document/DocumentViewer.tsx`
- 报告正文 `font-serif`
- `ReportSection` 折叠从 GSAP 单向动画改为 **CSS 双向折叠**（`collapse-grid` + `chevron-rotate`），删除了 GSAP 相关 ref

### 6. `src/pages/AgentPage.tsx` — 顶栏微调
- 删除了「分析中...」文字（仅保留停止/面板/历史按钮）

## 进行中任务：方案 A 两栏收敛（部分完成）

### 已完成：`src/components/chat/ChatHistory.tsx` 浮层化重构
- 删除了内部 `isExpanded` 折叠逻辑（原 w-64↔w-10 常驻栏模式）
- 新增 `onClose` prop；头部右上角 X 关闭按钮
- 搜索框 + 新建按钮合并为一行；条目简化（标题 + 日期同行，preview 单行，删除按钮 hover 显示）

### 未完成（接手者下一步）

1. **`src/pages/AgentPage.tsx` 集成浮层 + 自动滑出**：
   - 删除常驻 `<ChatHistory className="hidden lg:flex w-64/w-10">`，改为条件渲染浮层：
     - 容器：`absolute left-0 top-0 bottom-0 z-30 w-[280px] shadow-xl animate-slide-in-left`（相对 AgentPage 根容器，覆盖主区左缘）
     - 浮层外点击关闭：半透明 backdrop 或点击外部
   - 顶栏加「历史对话」按钮（`PanelLeftOpen` 或 `MessagesSquare` 图标），与「文档面板」按钮并列
   - **文档面板自动滑出**：`useEffect(() => { if (report) setShowPanel(true); }, [report])`
   - **无 report 时不渲染文档面板**（调研结论：artifact 面板只在有内容时显示）；顶栏文档按钮在无 report 时 disabled
   - 需要给 AgentPage 根容器加 `relative`
   - 注意 `hidden lg:flex` 的移动端逻辑已不需要（浮层不占位）
2. **加 slide-in-left 动画 utility**（`src/index.css`，参照现有 `.animate-slide-up`）
3. **视觉确认**（见下）

## 视觉确认流程（重要）

**当前模型无法读图**，交接模型必须先做：
1. 跑 `npx playwright test e2e/screenshot.spec.ts --config playwright.config.ts` 生成截图到 `visual-shots/`（临时 spec 已删除，需重建：首页空态 / 侧边栏折叠态 / 设置页 / 报告页）
2. **用视觉能力看图**，检查：暖灰是否生效、密度是否合适、空态是否清爽、折叠动画是否流畅
3. 调整后重新截图对比

程序化验证（也可用）：stone 暖灰 = `rgb(250, 250, 249)`；侧边栏折叠后宽 48px。

## 截图工作流说明

- Playwright 会清理 `test-results/`，截图要存到独立目录（如 `visual-shots/`）
- 临时 spec 用完删除（用户偏好干净 repo）
- 打包版 E2E：`npm run test:e2e:packaged`（真实 exe，3 分钟 +，最后跑）

## 常用命令

```bash
npm run dev:renderer   # 只起 React dev server（playwright webServer 会自动起）
npx playwright test e2e/screenshot.spec.ts --config playwright.config.ts
npm run typecheck      # 必须通过
npm run lint           # 必须通过
```

## 调研结论速查（2026 行业标准）

- 两栏标准：左历史栏 + 中聊天（max-w ~768px）+ 右 artifact 面板**只在有内容时滑出**
- Claude 2026 改版被赞 "feeling like reading"（留白 + 克制）；ChatGPT 反面教材 = header strip 功能堆砌
- 历史对话：auto-save、可搜索、标题 + 预览即可，不要过度装饰

## 用户沟通偏好

- 中文交流，简洁，解释「为什么」
- 每页改造后截图让用户确认，用户会切换模型看图
- 不改暗色模式；不引入新依赖除非必要
