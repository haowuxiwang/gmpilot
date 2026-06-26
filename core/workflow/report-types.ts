/**
 * AUTO-GENERATED from core/schema/deviation-report-schema.json
 * DO NOT EDIT MANUALLY — run `npm run codegen` to regenerate.
 *
 * Source: core/schema/deviation-report-schema.json
 * Generated: 2026-06-16T02:08:27.557Z
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
  /** 姓名 */
  name: string;
  /** 签字日期 */
  signatureDate: string;
}
/**
 * 审核人
 */
export interface ReviewedBy {
  /** 姓名 */
  name: string;
  /** 签字日期 */
  signatureDate: string;
}
/**
 * 重复偏差记录
 */
export interface RepeatDeviationRecord {
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
  /** 产品名称 */
  productName: string;
  /** 批次号 */
  batchNo: string;
  /** 当前状态 */
  currentStatus: string;
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
  /** 页数 */
  pages: number;
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
  /** 报告标题 — [fixed] */
  title: string;
  /** 报告标题(英文) — [fixed] */
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
  /** 根本原因调查 */
  rootCause: {
    interviews: string;
    sopReview: string;
    historicalData: string;
    relatedBatches: string;
    batchRecords: string;
    samplesReview: string;
    stabilityStudy: string;
    supplierReview: string;
    methods: {
      flowchart: boolean;
      fishbone: boolean;
      brainstorm: boolean;
      photos: string[];
    };
    humanError?: {
      machine: string;
      material: string;
      method: string;
      environment: string;
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
  /** 产品质量影响 — 对产品质量的影响 */
  qualityImpact: string;
  /** 稳定性影响 — 对稳定性的影响 */
  stabilityImpact: string;
  /** 注册影响 — 对注册的影响 */
  registrationImpact: string;
  /** 客户影响 — 对客户的影响 */
  customerImpact: string;
  /** 验证影响 — 对验证的影响 */
  validationImpact: string;
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
