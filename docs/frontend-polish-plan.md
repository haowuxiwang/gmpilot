# GMPilot 前端体验优化实施方案（对标成熟产品）

> 2026-08-26 · 基于 Linear/Vercel/Stripe/Notion 设计体系调研 + Motion vs CSS 选型分析
> 配套决策：动画库选 motion（原 framer-motion）按需引入，微交互继续用纯 CSS

## 一、调研结论（指导原则）

来自 Linear/Vercel/Stripe 及 2025-2026 动效趋势的共同点：

1. **目的先行**：动效必须有功能（反馈状态）/信息（引导视线）/愉悦（品牌感）三者之一的理由，装饰性动效一律砍掉
2. **时长纪律**：150ms=即时感、200-300ms=交互满足感、400-600ms=页面级入场、>700ms 只允许环境类背景。linear easing 几乎总是错的
3. **物理感**：spring/damping 取代线性过渡；`cubic-bezier(0.16,1,0.3,1)` 是入场标准曲线（项目已在用）
4. **reduced-motion 必须尊重**：所有循环动画（glow/spin/shimmer）在 `prefers-reduced-motion: reduce` 下停用——当前项目完全没做，是合规缺口
5. **性能分层**：hover/focus/折叠等状态切换用 CSS transition（compositor 线程，0KB）；列表重排/共享元素/退出动画用 Motion 的 layout/AnimatePresence（CSS 做不了）
6. **教训案例（本项目已踩）**：`transition-all` 与 keyframe 动画叠加会互相干扰产生视觉伪影（绿色方框 bug 根因）——规范禁止对有 CSS animation 的元素使用 `transition-all`

## 二、技术选型

| 场景 | 工具 | 理由 |
|---|---|---|
| hover/focus/按下反馈 | 纯 CSS transition-colors/transform | compositor 线程，零包体 |
| 折叠展开（已有 collapse-grid） | 保持纯 CSS | 已实现且稳定 |
| 列表项入场 stagger | 保持纯 CSS stagger-* | 已实现 |
| **页面/路由切换过渡** | **motion AnimatePresence** | React 路由卸载需要 exit 动画，CSS 无法做 |
| **报告生成完成→文档面板滑出** | **motion layout** | 面板从无到有的布局动画，spring 物理感 |
| Toast 进出场 | motion AnimatePresence | 当前直接消失，缺退场 |
| 流式文本光标/打字点 | 保持 CSS | 已够用 |
| GSAP | 移除 | 与 motion 职责重叠，仅剩一处入场动画可迁移 |

包体影响：Motion core 懒加载 ~6KB initial / 14KB full，Electron 桌面应用可忽略。

## 三、分组件优化清单

### A. 按钮 button.tsx ✅部分达标 → 补齐
- [x] primary 已有 translateY(-1px) + shadow 分层
- [ ] 补 active 态：`active:scale-[0.98]`（按压物理感，全变体统一）
- [ ] ghost/secondary 补 `transition-colors duration-150`（现在部分变体无时长）
- [ ] focus-visible ring 统一 2px teal + 3px offset 光晕（已有，校验各变体）

### B. 卡片 Card / 表格行
- [ ] Card 统一 hover：`hover:border-stone-200 hover:shadow-md` 过渡 200ms（现在只有部分页面有）
- [ ] ReportsPage/KnowledgePage 表格行：hover 时行首图标 micro-bounce（scale 1.06, 150ms）
- [ ] 统计卡片数字变化用 motion 的 value change（风险评分出现时滚动到目标值）

### C. 布局与空间
- [x] 两栏收敛布局已达标
- [ ] 文档面板滑出改 motion layout spring（stiffness 120, damping 15）替代现 width transition——消除 380px 宽度突变感
- [ ] 历史对话浮层加 backdrop 渐隐与面板 slide 同步（现在两个动画时长不一致）
- [ ] 页面切换加淡入（View Transitions API 不可用于 Electron 旧内核，用 motion）

### D. 动效专项
- [ ] **全部循环动画包 prefers-reduced-motion 媒体查询**（glow/spin/shimmer/breathe/typingDot）
- [ ] WorkflowProgress 步骤完成时 Check 图标 spring pop（scale 0.6→1.1→1，motion）
- [ ] Toast 进出场：进场 y+8 fade 200ms，退场 fade 150ms（AnimatePresence）
- [ ] fallback 横幅出现时高度展开动画（collapse-grid 复用）
- [ ] 索引进度条数值变化平滑过渡（已用 transition-all width，保留）

### E. 反馈与状态可见性（体验核心）
- [ ] 全局 loading 统一：按钮内 Loader2 尺寸 16px 标准
- [ ] 工作流进行中导航项加小脉冲点（提示"后台仍在跑"，配合跨路由持久化）
- [ ] 错误态 ErrorState 加重试图标动效（rotate -8deg hover 回正）

## 四、实施顺序（每步独立提交+验证）

| 批次 | 内容 | 触达文件 |
|---|---|---|
| P1 | reduced-motion 合规 + transition-all 清理（防伪影复发） | index.css, 全局 grep |
| P2 | 按钮/Card 微交互补齐 | ui/button.tsx, ui/card.tsx |
| P3 | 引入 motion：Toast 进出场 + 文档面板 layout 弹簧 | package.json, providers/ToastProvider.tsx, DocumentViewer.tsx |
| P4 | WorkflowProgress Check pop + 导航脉冲点 | WorkflowProgress.tsx, Sidebar.tsx |
| P5 | 移除 GSAP，迁移最后一处入场动画 | WorkflowProgress.tsx |
| P6 | 打包回归 + e2e 全绿 | — |

## 五、验收标准

- 所有循环动画在系统开启"减少动态效果"后静止
- 无任何元素同时挂 CSS animation 和 transition-all
- 交互反馈 ≤300ms，页面级 ≤600ms
- 打包版 e2e 7/7 通过（动画不得破坏定位器）
