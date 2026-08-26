# GMPilot 稳定性与前端样式审查报告（2026-08-26）

## 一、打包版 e2e 多轮测试结果

同一构建物（a7d059a）连续 4 轮：

| 轮次 | 结果 | 工作流耗时 | 备注 |
|---|---|---|---|
| 1 | 7/7 ✅ | 2.5m | |
| 2 | 7/7 ✅ | 3.0m | |
| 3 | 6/7（测试5定位器超时） | — | 测试缺陷非产品缺陷，已改用 hasText 定位器 |
| 4 | 7/7 ✅ | 3.1m | |

**结论**：核心链路稳定。唯一偶发失败是 SiliconFlow 高峰期单模块 LLM 超 180s 触发模块级超时走 fallback（报告仍完整产出），e2e 等待窗已提至 480s。

## 二、问题根因（全部已定位）

### 1. 内置知识库"只有 1 个文件"
- 打包版 embedding 用**本地 worker**（BAAI 模型），每文件索引实测 **60-90 秒**
- 55 个文件首启需约 1 小时后台索引；期间列表只有已注册的几条
- GMP/ 目录的 39 个 PDF 已由 build-knowledge 预处理为 knowledge/builtin/*.txt 并随包分发，数据源没问题
- **修复方向**：设置页提供「云 embedding」选项（SiliconFlow bge 同款模型），或 worker 改并行批量推理

### 2. "无法正式生成偏差文档"/部分章节失败
日志证据：
- `cover schema validation failed ×3 → fallback`（LLM 返回 JSON 字段与 zod schema 不符）
- `investigation-root-cause JSON parse failed: Expected ',' or '}' at position 1313`（输出被 maxTokens 截断）
- `capa timeout 180s`（高峰期限流）
- **这些都有 fallback 兜底，报告最终 assembled（8 sections, riskScore=80）**——不是"生成失败"，是"部分章节模板兜底"。UI 有黄色警告提示但不够醒目
- 修复方向：① caller 对 JSON 截断自动追加"continue"续写；② cover prompt 的 schema 示例收紧；③ fallback 时 UI 顶部横幅明示

### 3. 流程节点背景变绿 —— 已修复
glowPulse 动画的 box-shadow 覆盖了 shadow-md 类。已改为 opacity/scale 动画。

### 4. 切页后流程状态丢失
- AgentPage 是路由组件，切到"偏差报告/知识库"时 React 卸载组件，`useDeviationWorkflow` 的 useState 全部重置
- 主进程 actor 继续跑到完成并入库（数据不丢），但 UI 回来后看不到进行中的流程
- **修复方向**：把工作流状态提升到 App 层 Context（或 Zustand store），AgentPage 只订阅；这是护城河级体验问题，优先做

### 5. 偏差报告列表为空
- 报告只在 workflow 完成到达 review 态才 createReport 入库；中断/取消即全丢
- checkpoint 表已有（004 migration）但未实现恢复逻辑
- 修复方向：review 前每阶段完成即 upsert 报告草稿

### 6. Word 导出字体
- 工厂模板本体正确：正文 Arial + eastAsia 宋体、sz=21（10.5pt = 五号）
- prepare-word-template.cjs 生成的占位 run 也是 Arial/sz21
- 用户看到差异的是**应用内预览**（Noto Serif 衬线渲染），导出的 docx 本身字体正确
- 待办：导出真实 docx 与原模板逐节对比验证一次

## 三、鲁棒性评估

| 维度 | 评级 | 说明 |
|---|---|---|
| 抗挫折 | ★★★★☆ | 单模块失败必走 fallback，主流程不中断（e2e 证明） |
| 泛化 | ★★★☆☆ | 提示词对中文线索良好，英文/混合输入未系统测试 |
| 可观测 | ★★★☆☆ | 主进程日志完善；缺前端状态机事件日志与索引进度推送 |

## 四、前端样式优化方案（对标 Linear/Vercel/Stripe）

当前基础已好（stone 暖灰 + teal 品牌、CSS 双向折叠、GSAP 入场）。差距与行动：

1. **微交互一致性**（对标 Linear）：所有可点元素 hover 反馈 ≤150ms、active 缩放 0.98；目前 button.tsx 已有，补齐 Card/Table Row/历史对话条目
2. **加载骨架**（对标 Notion）：列表页已有 Skeleton；聊天区流式等待建议改为步骤化的进度卡片而非单纯 spinner
3. **状态色彩语义**（对标 Stripe Dashboard）：成功/警告/错误只用色阶表达；fallback 警告横幅用 amber 底+左侧 3px 边条
4. **空态设计**：知识库/报告空态加插画式图标+主行动按钮（已有雏形）
5. **动效克制原则**：入场 GSAP 只用于首屏一次，列表项 stagger ≤240ms，禁用循环动画除 spinner/glow
6. **暗色模式**：维持砍掉决策不变

## 五、下一步优先级（建议顺序）

1. 【高】工作流状态全局持久化（Context/store 提升）——解决切页丢流程
2. 【高】云 embedding 可选配置——解决知识库首启 1 小时问题
3. 【中】JSON 截断续写 + cover prompt 收紧——减少 fallback 率
4. 【中】报告草稿增量入库——中断不丢数据
5. 【中】导出 docx 与工厂模板逐节 diff 验证脚本
