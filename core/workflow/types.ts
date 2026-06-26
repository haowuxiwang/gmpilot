/**
 * GMPilot deviation generation workflow types.
 * Aligned with AuditBee data models for seamless integration.
 *
 * AuditBee reference: D:/learn/claudecode/gmpaudit/backend/app/models/
 */

// ============================================================================
// AuditBee-compatible enums (source of truth: AuditBee models)
// ============================================================================

/** 审计任务状态 — 对齐 AuditBee TaskStatus */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'awaiting_review'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'failed';

/** 审计任务类型 — 对齐 AuditBee TaskType */
export type TaskType =
  | 'deviation_analysis'
  | 'sop_compliance'
  | 'consistency_check'
  | 'risk_assessment';

/** 发现类型 — 对齐 AuditBee FindingType */
export type FindingType =
  | 'logic_flaw'
  | 'compliance_risk'
  | 'inconsistency'
  | 'missing_info'
  | 'best_practice';

/** 严重程度 — 对齐 AuditBee SeverityLevel */
export type SeverityLevel = 'high' | 'medium' | 'low' | 'info';

/** 报告类型 — 对齐 AuditBee ReportType */
export type ReportType = 'full_report' | 'summary' | 'risk_alert';

/** 文档处理状态 — 对齐 AuditBee DocumentStatus */
export type DocumentStatus = 'uploaded' | 'processing' | 'processed' | 'failed';

// ============================================================================
// GMPilot domain types
// ============================================================================

/** 线索输入 */
export interface ClueInput {
  text: string;
  files: FileRef[];
}

/** 文件引用 */
export interface FileRef {
  name: string;
  path: string;
  type: 'pdf' | 'docx' | 'txt' | 'image';
}

/** 步骤2: 线索分析结果 */
export interface ClueAnalysis {
  summary: string;
  keyEvents: string[];
  involvedParties: string[];
  documentType: TaskType;
}

/** 步骤3: 5M1E 因素 — 每个因素可生成多个 Finding */
export interface Factor5M1E {
  man: string[];         // 人 — 操作人员因素
  machine: string[];     // 机 — 设备设施因素
  material: string[];    // 料 — 原辅料因素
  method: string[];      // 法 — 工艺方法因素
  environment: string[]; // 环 — 生产环境因素
}

/** 审计发现 — 对齐 AuditBee Finding 表 */
export interface Finding {
  id?: number;
  task_id?: number;
  document_id?: number;
  finding_type: FindingType;
  severity: SeverityLevel;
  title: string;
  description: string;
  evidence?: string;
  suggestion?: string;
  location?: string;
  regulation_ref?: string;
  created_at?: string;
}

/** 步骤4: 法规匹配结果 */
export interface RegulationMatch {
  regulation: string;   // 法规名称
  chapter: string;      // 章节
  article: string;      // 条款编号
  title: string;        // 条款标题
  content: string;      // 条款内容摘要
  relevance: string;    // 与偏差的关联说明
}

// ============================================================================
// GMP 偏差报告结构 — AUTO-GENERATED from schema
// Report types are generated from core/schema/deviation-report-schema.json
// Run `npm run codegen` to regenerate.
// ============================================================================

export {
  type ReportMetadata,
  // Sub-types (generated from schema definitions)
  type PreparedBy,
  type ReviewedBy,
  type RepeatDeviationRecord,
  type OtherProductRecord,
  type CapaRecord as CAPARecord,
  type Attachment as ReportAttachment,
  type VersionHistory as ReportVersionHistory,
  type Cover as ReportCover,
  type Background as ReportBackground,
  type Investigation as ReportInvestigation,
  type Conclusion as ReportConclusion,
  type RiskAssessment as ReportRiskAssessment,
  type Capa as ReportCAPA,
} from './report-types';

// Import DeviationReport type for use in WorkflowContext
import type { DeviationReport } from './report-types';

/** 工作流完整上下文 */
export interface WorkflowContext {
  // 输入
  clueInput: ClueInput;
  // 步骤产出
  analysis: ClueAnalysis | null;
  factors: Factor5M1E | null;
  regulationContext: string;   // 优化1: RAG 检索结果，阶段2并行获取
  regulations: RegulationMatch[];
  findings: Finding[];     // 5M1E → Finding 转换结果
  report: DeviationReport | null;
  // 状态
  currentStep: number;
  error: string | null;
}

// Re-export DeviationReport for consumers
export type { DeviationReport } from './report-types';
