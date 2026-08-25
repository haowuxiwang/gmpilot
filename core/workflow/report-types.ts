/**
 * AUTO-GENERATED from core/schema/deviation-report-schema.json
 * DO NOT EDIT MANUALLY — run `npm run codegen` to regenerate.
 *
 * Source: core/schema/deviation-report-schema.json
 * Generated: 2026-08-07T02:15:42.142Z
 */

// Import types that are not generated from schema
import type { ReportType, TaskType, SeverityLevel, Factor5M1E, RegulationMatch, Finding } from './types';

// Re-export for convenience
export type { ReportType, TaskType, SeverityLevel, Factor5M1E, RegulationMatch, Finding };

// ============================================================================
// Generated interfaces from schema definitions
// ============================================================================

/**
 * 起草人
 */
export interface PreparedBy {
  /** 部门 — 起草人所在部门 */
  department: string;
  /** 姓名 */
  name: string;
  /** 签字日期 */
  signatureDate: string;
}
/**
 * 审核人
 */
export interface ReviewedBy {
  /** 部门 — 审核人所在部门 */
  department: string;
  /** 姓名 */
  name: string;
  /** 签字日期 */
  signatureDate: string;
}
/**
 * 重复偏差记录
 */
export interface RepeatDeviationRecord {
  /** 序号 */
  no: string;
  /** 发生时间 */
  time: string;
  /** 偏差编号 */
  deviationNo: string;
  /** 偏差描述 */
  description: string;
  /** 根本原因 */
  rootCause: string;
  /** CAPA措施 */
  capa: string;
}
/**
 * 其他产品/批次记录
 */
export interface OtherProductRecord {
  /** 序号 */
  no: string;
  /** 产品名称 */
  productName: string;
  /** 批次号 */
  batchNo: string;
  /** 当前状态 */
  currentStatus: string;
}
/**
 * 调查范围记录
 */
export interface InvestigationScopeRecord {
  /** 调查范围 */
  category: string;
  /** 调查内容 */
  details: string;
  /** 识别的风险点 */
  ruledInOut: string;
}
/**
 * CAPA记录
 */
export interface CapaRecord {
  /** CAPA编号 */
  capaNo: string;
  /** 措施内容 */
  content: string;
  /** 执行人 */
  executor: string;
  /** 预期完成日期 */
  expectedDate: string;
  /** 签名日期 */
  signatureDate: string;
}
/**
 * 附件
 */
export interface Attachment {
  /** 编号 */
  no: string;
  /** 附件名称 */
  name: string;
  /** 总页数 — 附件总页数，如「15页」 */
  pages: string;
}
/**
 * 版本历史
 */
export interface VersionHistory {
  /** 版本号 */
  version: string;
  /** 执行日期 */
  executionDate: string;
  /** 修订原因 */
  revisionReason: string;
  /** 主要变更 */
  mainChanges: string;
}
/**
 * 封面
 */
export interface Cover {
  /** 报告标题 — 动态标题，格式：<偏差对象>偏差调查和风险评估报告，如「RT探头（编号：NBQ6）偏差调查和风险评估报告」 */
  title: string;
  /** 报告标题(英文) — 动态英文标题，格式：Deviation Investigation and Risk Assessment Report for <Object> */
  titleEn: string;
  /** 部门 — 偏差发生部门 */
  department: string;
  preparedBy: PreparedBy;
  reviewedBy: ReviewedBy;
}
/**
 * 背景
 */
export interface Background {
  /** 涉及产品 — 涉及产品名称 */
  product: string;
  /** 批次号 — 涉及批次号 */
  batch: string;
  /** 发生时间 — 偏差发生的具体时间 */
  occurrenceTime: string;
  /** 发生地点 — 偏差发生的具体位置 */
  location: string;
  /** 偏差描述 — 详细描述偏差现象、涉及的产品/批次/设备 */
  description: string;
  /** 照片 */
  photos?: string[];
}
/**
 * 偏差调查
 */
export interface Investigation {
  /** 偏差调查引导句 — 偏差调查过程引言（如「发生偏差后，验证部验证人员XX立即上报验证主管并通知分管QA，QA组织和协调偏差涉及相关部门对偏差进行根源调查，调查过程如下：」） */
  investigationIntro?: string;
  /** 根本原因调查 */
  rootCause: {
    preliminaryAnalysis?: string;
    investigationScope?: InvestigationScopeRecord[];
    factors: {
      man: string;
      machine: string;
      material: string;
      method: string;
      environment: string;
      measurement: string;
    };
    methods: {
      flowchart: boolean;
      fishbone: boolean;
      brainstorm: boolean;
      photos: string[];
    };
    conclusion: string;
  };
  /** 重复偏差调查 */
  repeatDeviations: {
    records: RepeatDeviationRecord[];
    analysis: string;
    conclusion: string;
  };
  /** 其他产品/批次调查 */
  otherProducts: {
    records: OtherProductRecord[];
    analysis: string;
    conclusion: string;
  };
}
/**
 * 调查结论
 */
export interface Conclusion {
  /** 根本原因 */
  rootCause: string;
  /** 最有可能原因 — 如无法确定根本原因时填写 */
  mostLikelyCause?: string;
}
/**
 * 风险分析
 */
export interface RiskAssessment {
  /** 风险分析叙述 — 对产品质量、稳定性、注册、客户、验证有效性的整体影响进行叙述性分析（可多段，用换行分隔） */
  description: string;
  /** 小结 — 风险分析小结（如「小结：1）...；2）...」） */
  summary?: string;
}
/**
 * 纠正预防措施
 */
export interface Capa {
  /** 纠正措施 */
  corrections: CapaRecord[];
  /** 预防措施 */
  preventions: CapaRecord[];
}

// ============================================================================
// Generated root report interface
// ============================================================================

/** Report metadata — aligned with AuditBee report_metadata JSON */
export interface ReportMetadata {
  findings_count: number;
  task_type: TaskType;
  report_source: 'gmpilot_generate';
  deviation_id?: string;
  risk_score?: number;
  risk_level?: SeverityLevel;
}

/**
 * GMP偏差调查和风险评估报告
 * Deviation Investigation and Risk Assessment Report
 * Version: 1.0.0
 * AUTO-GENERATED — run `npm run codegen` to regenerate.
 */
export interface DeviationReport {
  // AuditBee compatible fields
  id?: number;
  task_id?: number;
  report_type: ReportType;
  title: string;
  report_metadata: ReportMetadata;

  /** 封面 */
  cover: Cover;
  /** 背景 */
  background: Background;
  /** 偏差调查 */
  investigation: Investigation;
  /** 调查结论 */
  conclusion: Conclusion;
  /** 风险分析 */
  riskAssessment: RiskAssessment;
  /** 纠正预防措施 */
  capa: Capa;
  /** 附件清单 */
  attachments: Attachment[];
  /** 版本修订历史 */
  versionHistory: VersionHistory[];

  // Computed fields
  deviationId: string;
  riskScore: number;
  riskLevel: SeverityLevel;

  // Raw data for audit and traceability
  factors: Factor5M1E;
  regulations: RegulationMatch[];
  findings: Finding[];
}
