# GMPilot 优化执行计划

## 概述

本文档定义了 GMPilot 项目的分阶段优化计划，涵盖性能优化、前端功能细化、UI/UX改进和新功能开发。

**执行周期：** 5周  
**目标：** 生成时间减少40-50%，前端性能提升60-80%，用户体验显著改善

---

## P0 - 立即执行（第1-2周）

### 任务 P0-1: LLM并行优化

**优先级：** 🔴 高  
**预期收益：** 生成时间减少40-50%  
**影响文件：**
- `core/workflow/assembler.ts`
- `core/workflow/modules/cover.ts`
- `core/workflow/modules/attachments.ts`

**当前状态：**
```
Phase 1: background + investigation (并行) ✓
Phase 2: conclusion (串行，依赖investigation)
Phase 3: riskAssessment + capa (并行) ✓
Phase 4: cover + attachments (并行，依赖Phase3) ✗ 过度依赖
```

**优化方案：**
```typescript
// assembler.ts - 修改 generateModules 函数
// 将cover和attachments提前到Phase1并行（它们不依赖其他模块）

// Phase 1: background + investigation + cover + attachments (并行)
const [background, investigation, cover, attachments] = await Promise.all([
  generators.background.generate(context),
  generators.investigation.generate(context),
  generators.cover.generate(context),  // 不依赖其他模块
  generators.attachments.generate(context),  // 不依赖其他模块
]);

// Phase 2: conclusion (依赖investigation)
const conclusion = await generators.conclusion.generate({
  ...context,
  previousResults: { investigation },
});

// Phase 3: riskAssessment + capa (并行，依赖conclusion)
const [riskAssessment, capa] = await Promise.all([
  generators.riskAssessment.generate({ ...context, previousResults: { investigation, conclusion } }),
  generators.capa.generate({ ...context, previousResults: { investigation, conclusion, riskAssessment } }),
]);
```

**验证要点：**
- [ ] 测试所有模块生成顺序正确
- [ ] 验证cover和attachments的输出质量不受影响
- [ ] 测量优化前后的生成时间对比

---

### 任务 P0-2: 本地嵌入批处理优化

**优先级：** 🔴 高  
**预期收益：** 嵌入生成速度提升3-5倍  
**影响文件：**
- `core/rag/embedder.ts`

**当前状态：**
```typescript
// embedder.ts:243-253 - 逐条串行推理
for (const text of batch) {
  const output = await pipeline(text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data as Float32Array).slice(0, this.dimensions);
  results.push(embedding);
}
```

**优化方案：**
```typescript
// embedder.ts - 修改 LocalEmbeddingProvider.embed 方法
async embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const validTexts = texts.map(t => t.trim() || ' ');

  const start = Date.now();
  await this.loadModel();

  // 批量推理（如果 @huggingface/transformers 支持）
  const pipeline = this.pipeline as any;
  const BATCH_SIZE = 32;  // 增大batch size
  
  const results: number[][] = [];
  for (let i = 0; i < validTexts.length; i += BATCH_SIZE) {
    const batch = validTexts.slice(i, i + BATCH_SIZE);
    
    // 尝试批量推理
    try {
      const outputs = await Promise.all(
        batch.map(text => pipeline(text, { pooling: 'mean', normalize: true }))
      );
      for (const output of outputs) {
        const embedding = Array.from(output.data as Float32Array).slice(0, this.dimensions);
        results.push(embedding);
      }
    } catch {
      // 回退到逐条推理
      for (const text of batch) {
        const output = await pipeline(text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data as Float32Array).slice(0, this.dimensions);
        results.push(embedding);
      }
    }
  }

  log.debug('Embeddings generated', { provider: this.name, texts: texts.length, duration: `${Date.now() - start}ms` });
  return results;
}
```

**验证要点：**
- [ ] 测试批量推理是否正常工作
- [ ] 验证嵌入质量（与逐条推理对比）
- [ ] 测量16个内置法规文档的嵌入时间

---

### 任务 P0-3: 品牌色系升级

**优先级：** 🔴 高  
**预期收益：** 视觉专业度提升  
**影响文件：**
- `src/index.css`
- `tailwind.config.js` (如果存在)
- `src/components/ui/*.tsx` (组件样式)

**当前状态：**
- 主色调：石灰色(stone)为主
- 强调色：青色(teal)为辅
- 整体偏冷淡，缺乏品牌识别度

**优化方案：**

1. **定义新的设计令牌**
```css
/* src/index.css - 添加设计变量 */
:root {
  /* 品牌色 */
  --color-primary: #0d9488;        /* teal-600 */
  --color-primary-light: #14b8a6;  /* teal-500 */
  --color-primary-dark: #0f766e;   /* teal-700 */
  
  /* 表面色 */
  --color-surface: #f8fafc;        /* slate-50 */
  --color-surface-hover: #f1f5f9;  /* slate-100 */
  
  /* 文本色 */
  --color-text-primary: #0f172a;   /* slate-900 */
  --color-text-secondary: #64748b; /* slate-500 */
  --color-text-muted: #94a3b8;     /* slate-400 */
  
  /* 边框色 */
  --color-border: #e2e8f0;         /* slate-200 */
  --color-border-light: #f1f5f9;   /* slate-100 */
  
  /* 间距系统 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  
  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  
  /* 阴影 */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

2. **更新组件样式**
```tsx
// 以 Button 组件为例
// src/components/ui/button.tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]',
        secondary: 'bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)]',
        ghost: 'hover:bg-[var(--color-surface-hover)]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-10 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);
```

**验证要点：**
- [ ] 所有组件样式统一
- [ ] 亮色/暗色模式正常（如果支持）
- [ ] 无障碍对比度符合WCAG标准

---

### 任务 P0-4: 工作流进度可视化

**优先级：** 🔴 高  
**预期收益：** 用户对生成过程的感知度提升  
**影响文件：**
- `src/components/chat/WorkflowProgress.tsx`

**当前状态：**
```
简单的步骤文字显示：分析中... → 识别中... → 匹配中...
```

**优化方案：**
```tsx
// WorkflowProgress.tsx - 可视化流程图
interface Step {
  id: WorkflowStepId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: Step[] = [
  { id: 'analyzing', label: '分析', icon: Brain },
  { id: 'identifying', label: '识别', icon: Search },
  { id: 'matching', label: '匹配', icon: BookOpen },
  { id: 'generating', label: '生成', icon: FileOutput },
  { id: 'auditing', label: '审核', icon: CheckCircle },
];

export function WorkflowProgress({ currentStep }: { currentStep: WorkflowStepId }) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);
  
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        
        return (
          <div key={step.id} className="flex items-center gap-2">
            {/* 步骤圆圈 */}
            <div className={`
              w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300
              ${isActive ? 'bg-[var(--color-primary)] text-white scale-110' : 
                isCompleted ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 
                'bg-[var(--color-surface)] text-[var(--color-text-muted)]'}
            `}>
              {isCompleted ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Icon className="w-3.5 h-3.5" />
              )}
            </div>
            
            {/* 步骤标签 */}
            <span className={`
              text-xs font-medium transition-colors
              ${isActive ? 'text-[var(--color-text-primary)]' : 
                isCompleted ? 'text-[var(--color-primary)]' : 
                'text-[var(--color-text-muted)]'}
            `}>
              {step.label}
            </span>
            
            {/* 连接线 */}
            {index < STEPS.length - 1 && (
              <div className={`
                w-8 h-0.5 mx-1 transition-colors
                ${index < currentIndex ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}
              `} />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**验证要点：**
- [ ] 进度动画流畅
- [ ] 步骤状态（进行中/已完成/待执行）显示正确
- [ ] 响应式布局在不同屏幕尺寸下正常

---

### 任务 P0-5: 历史对话浏览

**优先级：** 🔴 高  
**预期收益：** 用户可回溯历史对话  
**工作量：** 2天  
**影响文件：**
- `src/pages/AgentPage.tsx`
- `src/components/chat/ChatHistory.tsx` (新建)
- `electron/ipc/database.ts`

**实现方案：**

1. **数据模型扩展**
```typescript
// core/db/schema.ts - 添加对话表
export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}
```

2. **前端组件**
```tsx
// src/components/chat/ChatHistory.tsx
export function ChatHistory({ 
  conversations, 
  onSelect, 
  onDelete 
}: ChatHistoryProps) {
  return (
    <div className="w-64 border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="p-3 border-b border-[var(--color-border)]">
        <Button onClick={() => onSelect(null)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          新建对话
        </Button>
      </div>
      <div className="overflow-y-auto">
        {conversations.map(conv => (
          <div 
            key={conv.id}
            className="px-3 py-2 hover:bg-[var(--color-surface-hover)] cursor-pointer"
            onClick={() => onSelect(conv.id)}
          >
            <p className="text-sm text-[var(--color-text-primary)] truncate">
              {conv.title}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {formatDate(conv.updated_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

3. **IPC 接口**
```typescript
// electron/ipc/database.ts
ipcMain.handle('db:getConversations', async () => {
  const db = getDatabase();
  return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
});

ipcMain.handle('db:getConversationMessages', async (_, conversationId: number) => {
  const db = getDatabase();
  return db.prepare('SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at')
    .all(conversationId);
});
```

**验证要点：**
- [ ] 对话列表正常显示
- [ ] 点击对话可加载历史消息
- [ ] 新建对话功能正常
- [ ] 删除对话功能正常

---

### 任务 P0-6: 报告批量导出

**优先级：** 🔴 高  
**预期收益：** 批量场景效率提升  
**工作量：** 1天  
**影响文件：**
- `src/pages/ReportsPage.tsx`
- `electron/ipc/file.ts`

**实现方案：**

1. **前端批量选择**
```tsx
// ReportsPage.tsx - 添加批量操作
const [selectedIds, setSelectedIds] = useState<number[]>([]);

const handleBatchExport = async () => {
  const reports = selectedIds.map(id => reports.find(r => r.id === id)).filter(Boolean);
  
  for (const report of reports) {
    const parsed = parseReportContent(report!);
    if (parsed) {
      await window.gmpilot.file.exportPdf(parsed);
    }
  }
  
  success(`已导出 ${reports.length} 份报告`);
  setSelectedIds([]);
};

// 在表格中添加复选框
<input
  type="checkbox"
  checked={selectedIds.includes(report.id)}
  onChange={(e) => {
    if (e.target.checked) {
      setSelectedIds([...selectedIds, report.id]);
    } else {
      setSelectedIds(selectedIds.filter(id => id !== report.id));
    }
  }}
/>
```

2. **批量导出按钮**
```tsx
{selectedIds.length > 0 && (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-4">
    <span className="text-sm text-[var(--color-text-secondary)]">
      已选择 {selectedIds.length} 份报告
    </span>
    <Button onClick={handleBatchExport}>
      <Download className="w-4 h-4 mr-1" />
      批量导出 PDF
    </Button>
    <Button variant="ghost" onClick={() => setSelectedIds([])}>
      取消选择
    </Button>
  </div>
)}
```

**验证要点：**
- [ ] 多选功能正常
- [ ] 批量导出PDF正常
- [ ] 进度提示显示正确

---

## P1 - 高优先级（第2-3周）

### 任务 P1-1: RAG查询缓存

**优先级：** 🟠 中高  
**预期收益：** 查询延迟降低50-80%  
**影响文件：**
- `core/rag/retriever.ts`

**实现方案：**
```typescript
// retriever.ts - 添加LRU查询缓存
import { LRUCache } from 'lru-cache';

export class Retriever {
  private queryCache: LRUCache<string, RetrievalResult[]>;
  
  constructor(db: Database.Database, config?: Partial<RetrieverConfig>) {
    // ... 现有代码
    
    // 查询缓存：最多100条，TTL 5分钟
    this.queryCache = new LRUCache({
      max: 100,
      ttl: 5 * 60 * 1000,
    });
  }
  
  async retrieve(query: string, options?: RetrieveOptions): Promise<RetrievalResult[]> {
    // 生成缓存key
    const cacheKey = this.getCacheKey(query, options);
    
    // 检查缓存
    const cached = this.queryCache.get(cacheKey);
    if (cached) {
      log.debug('Cache hit', { query: query.slice(0, 50) });
      return cached;
    }
    
    // 执行查询
    const results = await this.doRetrieve(query, options);
    
    // 写入缓存
    this.queryCache.set(cacheKey, results);
    
    return results;
  }
  
  private getCacheKey(query: string, options?: RetrieveOptions): string {
    const hash = this.simpleHash(query);
    const topK = options?.topK || 5;
    const docId = options?.docId || 'all';
    return `${hash}:${topK}:${docId}`;
  }
  
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
```

**验证要点：**
- [ ] 缓存命中时查询延迟显著降低
- [ ] 缓存过期后重新查询正常
- [ ] 内存占用在合理范围内

---

### 任务 P1-2: 前端重渲染优化

**优先级：** 🟠 中高  
**预期收益：** 重渲染频率降低60-80%  
**影响文件：**
- `src/hooks/useDeviationWorkflow.ts`
- `src/components/chat/ChatStream.tsx`

**实现方案：**

1. **优化 useDeviationWorkflow**
```typescript
// useDeviationWorkflow.ts - 使用useRef减少重渲染
export function useDeviationWorkflow(callbacks?: WorkflowCallbacks) {
  const [step, setStep] = useState<WorkflowStep>('input');
  const [report, setReport] = useState<DeviationReport | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 使用useRef存储streaming数据，不触发重渲染
  const streamingRef = useRef<Partial<DeviationReport> | null>(null);
  
  useEffect(() => {
    const handleProgress = (data: PreloadWorkflowProgress) => {
      // 仅在关键状态变化时更新
      if (data.currentStep) {
        setStep(stepNames[data.currentStep - 1] || 'input');
      }
      if (data.report) {
        setReport(data.report);
      }
    };
    
    const handleStreaming = (data: { partial: Partial<DeviationReport> }) => {
      // 更新ref，不触发重渲染
      streamingRef.current = data.partial;
      
      // 使用requestAnimationFrame批量更新UI
      requestAnimationFrame(() => {
        setProgress(prev => prev ? { ...prev, streamingReport: data.partial } : prev);
      });
    };
    
    // ... 其余代码
  }, []);
}
```

2. **优化 ChatStream**
```tsx
// ChatStream.tsx - 使用React.memo减少重渲染
export const ChatStream = React.memo(function ChatStream({
  messages,
  isStreaming,
  streamingText,
  currentStep,
  progress,
  onQuickAction,
}: ChatStreamProps) {
  // ... 组件逻辑
});

// 优化自动滚动
useEffect(() => {
  if (!scrollRef.current) return;
  
  // 检查用户是否已手动滚动
  const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
  const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
  
  // 仅在接近底部时自动滚动
  if (isNearBottom) {
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }
}, [messages, streamingText]);
```

**验证要点：**
- [ ] streaming阶段UI流畅
- [ ] 内存占用稳定
- [ ] 用户手动滚动时不自动跳回底部

---

### 任务 P1-3: 内存优化

**优先级：** 🟠 中高  
**预期收益：** 峰值内存减少20-30%  
**影响文件：**
- `core/rag/store.ts`
- `core/workflow/deviation-machine.ts`

**实现方案：**

1. **优化LRU Cache**
```typescript
// store.ts - 使用Float32Array减少内存
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  // ... 其余方法
}

// 在VectorStore中使用
export class VectorStore {
  private embeddingCache: LRUCache<string, Float32Array>;
  
  constructor(db: Database.Database, config?: Partial<StoreConfig>) {
    // ...
    this.embeddingCache = new LRUCache(1000);
  }
  
  private searchFallback(queryEmbedding: number[], topK: number, docId?: number): VectorRecord[] {
    // ...
    const scored = rows.map((r) => {
      const cacheKey = String(r.id);
      let embedding = this.embeddingCache.get(cacheKey);
      
      if (!embedding) {
        // 将JSON数组转为Float32Array存储
        const parsed = JSON.parse(r.embedding) as number[];
        embedding = new Float32Array(parsed);
        this.embeddingCache.set(cacheKey, embedding);
      }
      
      // 使用Float32Array计算相似度
      return {
        ...r,
        similarity: cosineSimilarity(queryEmbedding, Array.from(embedding)),
      };
    });
  }
}
```

2. **清理中间数据**
```typescript
// deviation-machine.ts - 在generateModules完成后清理
actors: {
  generateModules: fromPromise(async ({ input }: { input: WorkflowContext }) => {
    // ... 生成报告
    
    // 清理不再需要的中间数据
    const report = assembleReport(deviationId, modules, input.factors, input.regulations, input.findings);
    
    return report;
  }),
}
```

**验证要点：**
- [ ] 内存占用在长时间运行后稳定
- [ ] 缓存命中率正常
- [ ] 相似度计算结果正确

---

### 任务 P1-4: 报告对比功能

**优先级：** 🟠 中高  
**预期收益：** 质量分析能力提升  
**工作量：** 3天  
**影响文件：**
- `src/pages/ReportsPage.tsx`
- `src/components/document/ReportDiff.tsx` (新建)

**实现方案：**
```tsx
// ReportDiff.tsx - 报告对比组件
interface DiffItem {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

export function ReportDiff({ report1, report2 }: { report1: DeviationReport; report2: DeviationReport }) {
  const diffs = useMemo(() => compareReports(report1, report2), [report1, report2]);
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">报告对比</h3>
      {diffs.map((diff, index) => (
        <div key={index} className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={diff.type === 'added' ? 'green' : diff.type === 'removed' ? 'red' : 'amber'}>
              {diff.type === 'added' ? '新增' : diff.type === 'removed' ? '删除' : '修改'}
            </Badge>
            <span className="text-sm text-[var(--color-text-secondary)]">{diff.path}</span>
          </div>
          {diff.type === 'changed' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-red-50 p-2 rounded text-sm">
                <span className="text-xs text-red-600">原版本</span>
                <pre className="mt-1">{JSON.stringify(diff.oldValue, null, 2)}</pre>
              </div>
              <div className="bg-green-50 p-2 rounded text-sm">
                <span className="text-xs text-green-600">新版本</span>
                <pre className="mt-1">{JSON.stringify(diff.newValue, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function compareReports(report1: DeviationReport, report2: DeviationReport): DiffItem[] {
  const diffs: DiffItem[] = [];
  
  // 比较各个部分
  const sections = ['background', 'investigation', 'conclusion', 'riskAssessment', 'capa'] as const;
  
  for (const section of sections) {
    const value1 = report1[section];
    const value2 = report2[section];
    
    if (JSON.stringify(value1) !== JSON.stringify(value2)) {
      diffs.push({
        path: section,
        type: 'changed',
        oldValue: value1,
        newValue: value2,
      });
    }
  }
  
  return diffs;
}
```

**验证要点：**
- [ ] 对比结果准确
- [ ] UI显示清晰
- [ ] 大报告对比性能可接受

---

### 任务 P1-5: 文档预览

**优先级：** 🟠 中高  
**预期收益：** 知识库体验提升  
**工作量：** 2天  
**影响文件：**
- `src/pages/KnowledgePage.tsx`
- `src/components/document/DocumentPreview.tsx` (新建)

**实现方案：**
```tsx
// DocumentPreview.tsx - 文档预览组件
export function DocumentPreview({ doc }: { doc: KnowledgeDoc }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // 获取文档内容（前1000字符）
    window.gmpilot.knowledge.getDocumentContent(doc.id, 1000)
      .then(setContent)
      .finally(() => setLoading(false));
  }, [doc.id]);
  
  if (loading) return <Skeleton className="h-32" />;
  
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-[var(--color-primary)]" />
        <h4 className="font-medium">{doc.filename}</h4>
        <Badge>{doc.category}</Badge>
      </div>
      <div className="text-sm text-[var(--color-text-secondary)] max-h-32 overflow-y-auto">
        <pre className="whitespace-pre-wrap font-sans">{content}</pre>
      </div>
      <div className="mt-3 text-xs text-[var(--color-text-muted)]">
        共 {doc.chunk_count} 个分块
      </div>
    </div>
  );
}
```

**验证要点：**
- [ ] 文档内容正确加载
- [ ] 预览滚动流畅
- [ ] 不同类型文档（txt, pdf）预览正常

---

### 任务 P1-6: 智能填充

**优先级：** 🟠 中高  
**预期收益：** 重复场景效率提升  
**工作量：** 5天  
**影响文件：**
- `core/rag/retriever.ts`
- `src/components/chat/ChatInput.tsx`
- `electron/ipc/workflow.ts`

**实现方案：**

1. **历史报告向量化**
```typescript
// retriever.ts - 添加报告检索
async retrieveSimilarReports(
  query: string,
  topK = 3,
): Promise<{ report: DeviationReport; similarity: number }[]> {
  // 1. 从数据库获取历史报告
  const db = getDatabase();
  const reports = getReports(db, 100);  // 最近100份报告
  
  // 2. 向量化报告摘要
  const summaries = reports.map(r => {
    const parsed = JSON.parse(r.content) as DeviationReport;
    return `${parsed.background.product} ${parsed.conclusion.rootCause}`;
  });
  
  // 3. 计算相似度
  const queryEmbedding = await this.embedder.embed([query]);
  const reportEmbeddings = await this.embedder.embed(summaries);
  
  // 4. 排序并返回最相似的报告
  const results = reports.map((report, i) => ({
    report: JSON.parse(report.content) as DeviationReport,
    similarity: cosineSimilarity(queryEmbedding[0], reportEmbeddings[i]),
  }));
  
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
```

2. **前端填充建议**
```tsx
// ChatInput.tsx - 添加智能填充建议
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [suggestions, setSuggestions] = useState<DeviationReport[]>([]);
  const [content, setContent] = useState('');
  
  const handleInputChange = async (value: string) => {
    setContent(value);
    
    if (value.length > 20) {
      // 输入超过20字符时触发智能建议
      const results = await window.gmpilot.knowledge.retrieveSimilarReports(value);
      setSuggestions(results.map(r => r.report));
    } else {
      setSuggestions([]);
    }
  };
  
  return (
    <div className="relative">
      <textarea
        value={content}
        onChange={(e) => handleInputChange(e.target.value)}
        // ...
      />
      
      {/* 智能填充建议 */}
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 bg-white border rounded-lg shadow-lg mb-2 max-h-48 overflow-y-auto">
          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-b">
            从历史报告填充
          </div>
          {suggestions.map((report, index) => (
            <div
              key={index}
              className="px-3 py-2 hover:bg-[var(--color-surface-hover)] cursor-pointer"
              onClick={() => {
                setContent(report.background.description);
                setSuggestions([]);
              }}
            >
              <p className="text-sm font-medium">{report.background.product}</p>
              <p className="text-xs text-[var(--color-text-muted)] truncate">
                {report.conclusion.rootCause}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**验证要点：**
- [ ] 相似报告检索准确
- [ ] 填充建议显示正确
- [ ] 点击填充后内容正确

---

## P2 - 中优先级（第3-4周）

### 任务 P2-1: 动态import优化

**优先级：** 🟡 中  
**预期收益：** 每个模块节省~10-20ms  
**影响文件：**
- `core/workflow/modules/base.ts`

**实现方案：**
```typescript
// base.ts - 改为静态导入
import { generateObject } from 'ai';
import { createLLMModel } from '../../llm/provider';

export abstract class BaseModuleGenerator {
  // ... 其他代码
  
  protected async callLLM(prompt: string, schema: unknown): Promise<unknown> {
    log.info(`Generating ${this.templateId}`, { promptLength: prompt.length });
    
    try {
      const result = await callLLMWithRetry(
        async (signal?: AbortSignal) => {
          const model = createLLMModel();
          
          return generateObject({
            model,
            prompt,
            schema: schema as any,
            abortSignal: signal,
          });
        },
        { node: this.templateId }
      );
      
      log.info(`Generated ${this.templateId}`, { success: true });
      return (result as { object: unknown }).object;
    } catch (error) {
      log.error(`Failed to generate ${this.templateId}`, { error: String(error) });
      throw error;
    }
  }
}
```

**验证要点：**
- [ ] 模块生成功能正常
- [ ] 性能略有提升

---

### 任务 P2-2: 多轮对话

**优先级：** 🟡 中  
**预期收益：** 复杂偏差处理能力提升  
**工作量：** 5天  
**影响文件：**
- `core/workflow/deviation-machine.ts`
- `src/hooks/useDeviationWorkflow.ts`
- `electron/ipc/workflow.ts`

**实现方案：**

1. **扩展WorkflowContext**
```typescript
// types.ts - 添加对话历史
export interface WorkflowContext {
  // ... 现有字段
  
  // 对话历史
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  
  // 当前对话轮次
  currentTurn: number;
}
```

2. **支持追问**
```typescript
// deviation-machine.ts - 添加追问状态
states: {
  // ... 现有状态
  
  review: {
    on: {
      // ... 现有事件
      
      // 追问事件
      FOLLOW_UP: {
        target: 'analyzing',
        actions: [
          'assignFollowUp',
          'incrementTurn',
        ],
      },
    },
  },
}

// 添加追问action
actions: {
  assignFollowUp: assign({
    clueInput: ({ event }) => ({
      text: event.type === 'FOLLOW_UP' ? event.question : '',
      files: [],
    }),
    conversationHistory: ({ context, event }) => [
      ...context.conversationHistory,
      { role: 'user', content: event.type === 'FOLLOW_UP' ? event.question : '', timestamp: new Date() },
    ],
  }),
}
```

3. **前端追问输入**
```tsx
// AgentPage.tsx - 添加追问输入
const handleFollowUp = async (question: string) => {
  setClueText(question);
  await runWorkflow(question);
};

// 在review状态显示追问输入框
{step === 'review' && (
  <div className="border-t border-[var(--color-border)] p-4">
    <ChatInput 
      onSend={handleFollowUp} 
      placeholder="追问或补充信息..."
    />
  </div>
)}
```

**验证要点：**
- [ ] 追问后报告更新正确
- [ ] 对话历史完整保存
- [ ] 多轮上下文正确传递

---

### 任务 P2-3: 标签分类

**优先级：** 🟡 中  
**预期收益：** 报告组织管理能力提升  
**工作量：** 2天  
**影响文件：**
- `core/db/schema.ts`
- `src/pages/ReportsPage.tsx`

**实现方案：**

1. **数据库扩展**
```sql
-- core/db/migrations/002_add_tags.sql
CREATE TABLE IF NOT EXISTS report_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id),
  UNIQUE(report_id, tag)
);

CREATE INDEX idx_report_tags_tag ON report_tags(tag);
```

2. **前端标签管理**
```tsx
// ReportsPage.tsx - 添加标签过滤
const [selectedTags, setSelectedTags] = useState<string[]>([]);

const filteredReports = useMemo(() => {
  return reports.filter(report => {
    const matchesSearch = report.title.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesTags = selectedTags.length === 0 || 
      report.tags?.some(tag => selectedTags.includes(tag));
    return matchesSearch && matchesTags;
  });
}, [reports, debouncedSearch, selectedTags]);

// 标签过滤器
<div className="flex items-center gap-2 mb-4">
  {allTags.map(tag => (
    <Badge
      key={tag}
      variant={selectedTags.includes(tag) ? 'default' : 'secondary'}
      onClick={() => {
        if (selectedTags.includes(tag)) {
          setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
          setSelectedTags([...selectedTags, tag]);
        }
      }}
      className="cursor-pointer"
    >
      {tag}
    </Badge>
  ))}
</div>
```

**验证要点：**
- [ ] 标签添加/删除功能正常
- [ ] 标签过滤显示正确
- [ ] 标签统计正确

---

## P3 - 低优先级（第4-5周）

### 任务 P3-1: 偏差预测

**优先级：** 🟢 低  
**预期收益：** 从被动到主动预防  
**工作量：** 10天  
**影响文件：**
- `core/analytics/` (新建目录)
- `src/pages/AnalyticsPage.tsx` (新建)

**实现方案：**
```typescript
// core/analytics/predictor.ts
export class DeviationPredictor {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  async predictRisk(factors: Factor5M1E): Promise<{
    riskScore: number;
    riskLevel: 'high' | 'medium' | 'low';
    topFactors: Array<{ factor: string; contribution: number }>;
    recommendations: string[];
  }> {
    // 1. 从历史数据学习
    const historicalData = await this.getHistoricalData();
    
    // 2. 计算每个因素的风险贡献
    const factorContributions = this.calculateFactorContributions(factors, historicalData);
    
    // 3. 预测风险分数
    const riskScore = this.predictScore(factorContributions);
    
    // 4. 生成建议
    const recommendations = this.generateRecommendations(factorContributions);
    
    return {
      riskScore,
      riskLevel: riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
      topFactors: factorContributions.slice(0, 5),
      recommendations,
    };
  }
  
  private calculateFactorContributions(factors: Factor5M1E, historicalData: any[]): Array<{ factor: string; contribution: number }> {
    // 基于历史数据计算每个因素的风险贡献
    // ...
  }
}
```

**验证要点：**
- [ ] 预测结果合理
- [ ] 建议具有可操作性
- [ ] 性能可接受

---

### 任务 P3-2: 多语言报告

**优先级：** 🟢 低  
**预期收益：** 国际化支持  
**工作量：** 5天  
**影响文件：**
- `core/workflow/modules/*.ts`
- `src/i18n/` (新建目录)

**实现方案：**
```typescript
// core/i18n/index.ts
export type Locale = 'zh-CN' | 'en-US';

const translations: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    'report.title': '偏差调查和风险评估报告',
    'report.background.product': '涉及产品',
    'report.background.batch': '批次号',
    // ...
  },
  'en-US': {
    'report.title': 'Deviation Investigation and Risk Assessment Report',
    'report.background.product': 'Product',
    'report.background.batch': 'Batch Number',
    // ...
  },
};

export function t(key: string, locale: Locale = 'zh-CN'): string {
  return translations[locale][key] || key;
}
```

**验证要点：**
- [ ] 中英文切换正常
- [ ] 所有文本翻译完整
- [ ] 格式（日期、数字）本地化正确

---

### 任务 P3-3: 语音输入

**优先级：** 🟢 低  
**预期收益：** 移动端场景支持  
**工作量：** 3天  
**影响文件：**
- `src/components/chat/ChatInput.tsx`

**实现方案：**
```tsx
// ChatInput.tsx - 添加语音输入按钮
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  const startRecording = async () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      onSend(text);
    };
    
    recognition.onend = () => {
      setIsRecording(false);
    };
    
    recognition.start();
    setIsRecording(true);
  };
  
  return (
    <div className="flex items-end gap-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        // ...
      />
      
      {/* 语音输入按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={startRecording}
        disabled={isRecording}
      >
        {isRecording ? (
          <Loader2 className="w-5 h-5 animate-spin text-red-500" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </Button>
      
      <Button onClick={() => onSend(content)}>
        <Send className="w-5 h-5" />
      </Button>
    </div>
  );
}
```

**验证要点：**
- [ ] 语音识别准确
- [ ] 识别结果正确填充
- [ ] 录音状态显示正确

---

## 执行检查清单

### 第1周
- [ ] P0-1: LLM并行优化
- [ ] P0-2: 本地嵌入批处理优化
- [ ] P0-3: 品牌色系升级（设计令牌定义）

### 第2周
- [ ] P0-3: 品牌色系升级（组件样式更新）
- [ ] P0-4: 工作流进度可视化
- [ ] P0-5: 历史对话浏览
- [ ] P0-6: 报告批量导出

### 第3周
- [ ] P1-1: RAG查询缓存
- [ ] P1-2: 前端重渲染优化
- [ ] P1-3: 内存优化

### 第4周
- [ ] P1-4: 报告对比功能
- [ ] P1-5: 文档预览
- [ ] P1-6: 智能填充

### 第5周
- [ ] P2-1: 动态import优化
- [ ] P2-2: 多轮对话
- [ ] P2-3: 标签分类

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM并行优化导致输出质量下降 | 高 | 充分测试，保留串行回退路径 |
| 嵌入批处理内存溢出 | 中 | 限制batch size，添加内存监控 |
| 品牌色系升级破坏现有样式 | 中 | 逐步迁移，使用CSS变量 |
| 多轮对话上下文丢失 | 高 | 持久化对话历史，添加checkpoint |
| 智能填充建议不准确 | 中 | 调整相似度阈值，允许用户忽略 |

---

## 成功指标

| 指标 | 当前值 | 目标值 | 测量方法 |
|------|--------|--------|----------|
| 报告生成时间 | 5-10分钟 | 2-4分钟 | 计时测试 |
| 首次嵌入延迟 | 2-5秒 | 0.5-1秒 | 嵌入性能测试 |
| 查询延迟 | 500ms-1s | 100-200ms | RAG查询测试 |
| 前端FPS | 30-45fps | 55-60fps | Chrome DevTools |
| 内存占用 | 200-300MB | 150-200MB | 内存监控 |
