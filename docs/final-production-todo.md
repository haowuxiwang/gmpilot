# 生产环境发布最终 TODO List

## 审查时间
2026-06-18

## 审查维度
1. 依赖完整性与版本兼容性
2. 功能完整性
3. 安全性
4. 性能
5. 日志系统
6. Pipeline 与并发

---

## 一、依赖完整性与版本兼容性

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P0 | keytar 已归档 | 迁移到 `electron.safeStorage` |
| P1 | xlsx v0.18.5 有安全漏洞 | 升级或替换为 exceljs |
| P2 | zod 未显式声明 | 添加到 dependencies |
| P2 | @ai-sdk/react 未使用 | 移除 |

## 二、功能完整性

**结论：所有功能模块完整，无缺失。**

- ✅ 核心工作流（6 状态 XState 机）
- ✅ RAG 管道（5 环节）
- ✅ 模版系统（6 模板）
- ✅ 前端 UI（5 页面 + 13 组件）
- ✅ IPC 桥接（7 模块 31 个通道）

## 三、安全性

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P1 | 事件监听器泄漏 | `removeAllListeners` 导致多组件冲突 |
| P1 | `db:getReports` 缺少参数验证 | limit/offset 未验证范围 |
| P1 | `db:createReport` 验证不完整 | risk_score/risk_level 未验证 |
| P1 | LLM baseUrl 用户可控可致 SSRF | 需要白名单验证 |
| P1 | 工作流临时文件扩展名未验证 | 需要白名单 |
| P2 | keytar 不可用时降级为明文 | 需要 UI 警告 |
| P2 | CSP 缺少 frame-ancestors | 添加防护 |

## 四、性能

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P1 | 报告列表查询读取大文本列 | 使用 SELECT 排除大字段 |
| P1 | 文件解析无大小限制 | 添加 10MB 限制 |
| P1 | fallback 向量搜索 O(n) | 限制搜索范围 |
| P1 | 内置知识库串行加载 | 并行处理 |
| P2 | 流式输出频繁触发滚动 | 使用 requestAnimationFrame 节流 |
| P2 | 模块生成器重复创建 model | 缓存 model 实例 |
| P2 | embedder 缺少 settings 缓存 | 添加缓存 |

## 五、日志系统

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P1 | 前端日志无法转发到后端 | 添加 IPC 转发 |
| P1 | 前端没有全局错误捕获 | 添加 window.onerror |
| P2 | 错误日志可能泄露 API key | 添加脱敏处理 |
| P2 | 缺少请求追踪 ID | 添加 correlationId |
| P2 | 指标数据仅内存存储 | 持久化到文件 |

## 六、Pipeline 与并发

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P1 | assembleReport 第三个参数传错 | findings vs factors |
| P1 | 工作流无互斥锁 | 添加 isRunning 标志 |
| P1 | 并行 LLM 调用无并发限制 | 添加并发信号量 |
| P2 | LLM 重试无 jitter | 添加随机延迟 |
| P2 | migration 执行非原子 | 使用事务包裹 |
| P2 | 超时后 actor 泄漏 | 监听窗口关闭事件 |

---

## 修复优先级

### P0（必须修复）
1. 迁移 keytar 到 electron.safeStorage

### P1（强烈建议修复）
1. 修复 assembleReport 参数错误
2. 添加工作流互斥锁
3. 添加 LLM 并发限制
4. 修复事件监听器泄漏
5. 添加输入验证
6. 添加文件大小限制
7. 优化报告列表查询
8. 添加前端全局错误捕获
9. 添加日志脱敏

### P2（建议修复）
1. 添加 zod 显式声明
2. 移除 @ai-sdk/react
3. 添加请求追踪 ID
4. 持久化指标数据
5. 优化内置知识库加载
6. 添加 CSP frame-ancestors

---

## 总预计时间

- P0: 2-3 小时
- P1: 8-10 小时
- P2: 4-6 小时
- **总计**: 14-19 小时
