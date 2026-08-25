/**
 * PDF template for GMP deviation report using react-pdf.
 * Professional GMP style with cover page, tables, and structured sections.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { DeviationReport } from '../../workflow/types';

// 使用 resolveResourcePath 解析字体路径：
// dev = cwd/resources/fonts；packaged = process.resourcesPath/resources/fonts（extraResources）
import { resolveResourcePath } from '../../utils/paths';

// ============================================================================
// Font Registration
// ============================================================================

const fontPath = resolveResourcePath('resources', 'fonts', 'NotoSerifCJKsc-Regular.otf');

try {
  Font.register({
    family: 'NotoSerifSC',
    src: fontPath,
  });
} catch (error) {
  console.warn('[PDF] Failed to register NotoSerifSC font:', error);
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Page styles
  page: {
    padding: 40,
    fontFamily: 'NotoSerifSC',
    fontSize: 10,
    lineHeight: 1.6,
  },
  coverPage: {
    padding: 60,
    fontFamily: 'NotoSerifSC',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Typography
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  titleEn: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#1a1a2e',
    borderBottom: '2 solid #1a1a2e',
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#333',
  },
  text: {
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 4,
  },
  bold: {
    fontWeight: 'bold',
  },
  small: {
    fontSize: 8,
    color: '#666',
  },

  // Layout
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  col: {
    flex: 1,
    paddingHorizontal: 4,
  },
  section: {
    marginTop: 12,
    marginBottom: 8,
  },
  divider: {
    borderBottom: '1 solid #e0e0e0',
    marginVertical: 12,
  },

  // Table styles
  table: {
    width: '100%',
    border: '1 solid #333',
    marginTop: 8,
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #333',
  },
  tableCell: {
    padding: 6,
    borderRight: '1 solid #333',
    fontSize: 9,
    flex: 1,
  },
  tableCellLast: {
    borderRight: 'none',
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  },
  tableCellCenter: {
    textAlign: 'center',
  },

  // Signature table (factory template: 3 rows x 6 columns)
  signatureTable: {
    width: '90%',
    border: '1 solid #333',
    marginTop: 20,
    alignSelf: 'center',
  },
  signatureRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #333',
    height: 40,
  },
  signatureCell: {
    padding: 6,
    borderRight: '1 solid #333',
    fontSize: 9,
    justifyContent: 'center',
  },
  signatureCellLast: {
    borderRight: 'none',
  },
  signatureCellHeader: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
    fontSize: 9,
    textAlign: 'center',
  },
  signatureCellRole: {
    width: 120,
    backgroundColor: '#f8f8f8',
    fontWeight: 'bold',
    fontSize: 9,
  },

  // Risk badges
  riskHigh: {
    color: '#ff4d4f',
    fontWeight: 'bold',
  },
  riskMedium: {
    color: '#faad14',
    fontWeight: 'bold',
  },
  riskLow: {
    color: '#52c41a',
    fontWeight: 'bold',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#999',
    borderTop: '1 solid #e0e0e0',
    paddingTop: 8,
  },
});

// ============================================================================
// Helper Components
// ============================================================================

/** Simple table component */
const Table = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <View style={styles.table}>
    {/* Header */}
    <View style={[styles.tableRow, styles.tableHeader]}>
      {headers.map((h, i) => (
        <View key={i} style={[styles.tableCell, i === headers.length - 1 ? styles.tableCellLast : {}]}>
          <Text style={styles.bold}>{h}</Text>
        </View>
      ))}
    </View>
    {/* Rows */}
    {rows.map((row, i) => (
      <View key={i} style={styles.tableRow}>
        {row.map((cell, j) => (
          <View key={j} style={[styles.tableCell, j === row.length - 1 ? styles.tableCellLast : {}]}>
            <Text>{cell}</Text>
          </View>
        ))}
      </View>
    ))}
  </View>
);

/** Section with title and content */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

/** Labeled text field */
const Field = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.bold}>{label}：</Text>
    <Text style={styles.text}>{value || '—'}</Text>
  </View>
);

// ============================================================================
// Cover Page
// ============================================================================

const CoverPage = ({ report }: { report: DeviationReport }) => (
  <Page size="A4" style={styles.coverPage}>
    <View style={{ marginBottom: 60 }}>
      <Text style={styles.title}>{report.cover.title}</Text>
      <Text style={styles.titleEn}>{report.cover.titleEn}</Text>
    </View>

    <View style={{ marginBottom: 40 }}>
      <Field label="偏差编号 Deviation No." value={report.deviationId} />
    </View>

    {/* Signature Table — Factory template: 3 rows x 6 columns */}
    <View style={styles.signatureTable}>
      {/* Row 1: Header */}
      <View style={styles.signatureRow}>
        <View style={[styles.signatureCell, styles.signatureCellHeader, { width: 120 }]}>
          <Text></Text>
        </View>
        <View style={[styles.signatureCell, styles.signatureCellHeader, { flex: 2 }]}>
          <Text>部门 Department</Text>
        </View>
        <View style={[styles.signatureCell, styles.signatureCellHeader, { flex: 1 }]}>
          <Text>姓名 Name</Text>
        </View>
        <View style={[styles.signatureCell, styles.signatureCellHeader, styles.signatureCellLast, { flex: 2 }]}>
          <Text>签字/日期 Signature/Date</Text>
        </View>
      </View>
      {/* Row 2: Prepared by */}
      <View style={styles.signatureRow}>
        <View style={[styles.signatureCell, styles.signatureCellRole]}>
          <Text>起草人{'\n'}Prepared by</Text>
        </View>
        <View style={[styles.signatureCell, { flex: 2 }]}>
          <Text>偏差发生部门主管</Text>
        </View>
        <View style={[styles.signatureCell, { flex: 1 }]}>
          <Text>{report.cover.preparedBy.name || '________'}</Text>
        </View>
        <View style={[styles.signatureCell, styles.signatureCellLast, { flex: 2 }]}>
          <Text>{report.cover.preparedBy.signatureDate || '____年__月__日'}</Text>
        </View>
      </View>
      {/* Row 3: Reviewed by */}
      <View style={styles.signatureRow}>
        <View style={[styles.signatureCell, styles.signatureCellRole]}>
          <Text>审核人{'\n'}Reviewed by</Text>
        </View>
        <View style={[styles.signatureCell, { flex: 2 }]}>
          <Text>偏差发生部门负责人</Text>
        </View>
        <View style={[styles.signatureCell, { flex: 1 }]}>
          <Text>{report.cover.reviewedBy.name || '________'}</Text>
        </View>
        <View style={[styles.signatureCell, styles.signatureCellLast, { flex: 2 }]}>
          <Text>{report.cover.reviewedBy.signatureDate || '____年__月__日'}</Text>
        </View>
      </View>
    </View>

    <View style={{ marginTop: 60 }}>
      <Text style={styles.small}>由 GMPilot 生成 | {new Date().toLocaleDateString('zh-CN')}</Text>
    </View>
  </Page>
);

// ============================================================================
// Main Content Pages
// ============================================================================

const ContentPages = ({ report }: { report: DeviationReport }) => {
  const riskColorStyle =
    report.riskLevel === 'high'
      ? styles.riskHigh
      : report.riskLevel === 'medium'
        ? styles.riskMedium
        : styles.riskLow;

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <Text style={styles.subtitle}>偏差调查和风险评估报告 Deviation Investigation and Risk Assessment Report</Text>
      <View style={styles.row}>
        <Text style={styles.text}>
          <Text style={styles.bold}>偏差编号：</Text>{report.deviationId}
        </Text>
        <Text style={styles.text}>
          <Text style={styles.bold}>风险评分：</Text>
          <Text style={riskColorStyle}>{report.riskScore}/100</Text>
        </Text>
        <Text style={styles.text}>
          <Text style={styles.bold}>风险等级：</Text>
          <Text style={riskColorStyle}>
            {report.riskLevel === 'high' ? '高' : report.riskLevel === 'medium' ? '中' : '低'}
          </Text>
        </Text>
      </View>

      {/* Section 1: Background */}
      <Section title="1. 背景 Background">
        <Field label="涉及产品 Product" value={report.background.product} />
        <Field label="批次号 Batch No." value={report.background.batch} />
        <Field label="发生时间 Occurrence Time" value={report.background.occurrenceTime} />
        <Field label="发生地点 Location" value={report.background.location} />
        <Text style={[styles.text, { marginTop: 8 }]}>{report.background.description}</Text>
      </Section>

      {/* Section 2: Investigation */}
      <Section title="2. 偏差调查 Deviation Investigation">
        {report.investigation.investigationIntro && (
          <Text style={styles.text}>{report.investigation.investigationIntro}</Text>
        )}
        {/* 2.1 Root Cause */}
        <Text style={[styles.bold, { marginBottom: 4 }]}>2.1 根本原因调查 Root Cause Investigation</Text>
        {report.investigation.rootCause.preliminaryAnalysis && (
          <Field label="初步分析 Preliminary Analysis" value={report.investigation.rootCause.preliminaryAnalysis} />
        )}

        {/* Investigation scope table (optional) */}
        {report.investigation.rootCause.investigationScope &&
          report.investigation.rootCause.investigationScope.length > 0 && (
            <Table
              headers={['调查范围 Category', '调查内容 Details', '识别的风险点 Ruled In/Out']}
              rows={report.investigation.rootCause.investigationScope.map((s) => [
                s.category,
                s.details,
                s.ruledInOut,
              ])}
            />
          )}

        {/* 5M1E + Measurement factors */}
        <Text style={[styles.bold, { marginTop: 8, marginBottom: 4 }]}>人、机、料、法、环、测全面调查:</Text>
        <Field label="人员 Man" value={report.investigation.rootCause.factors.man} />
        <Field label="设备 Machine" value={report.investigation.rootCause.factors.machine} />
        <Field label="物料 Material" value={report.investigation.rootCause.factors.material} />
        <Field label="方法 Method" value={report.investigation.rootCause.factors.method} />
        <Field label="环境 Environment" value={report.investigation.rootCause.factors.environment} />
        <Field label="测量 Measurement" value={report.investigation.rootCause.factors.measurement} />

        {/* Investigation Methods */}
        {report.investigation.rootCause.methods && (
          <View style={{ marginTop: 8, marginBottom: 4 }}>
            <Text style={styles.bold}>调查分析方法 Methods:</Text>
            <Text style={styles.text}>
              事件流程图 Flowchart: {report.investigation.rootCause.methods.flowchart ? '☑' : '☐'}  {' '}
              鱼骨图 Fishbone: {report.investigation.rootCause.methods.fishbone ? '☑' : '☐'}  {' '}
              头脑风暴 Brainstorm: {report.investigation.rootCause.methods.brainstorm ? '☑' : '☐'}
            </Text>
          </View>
        )}

        <Field label="调查结论 Conclusion" value={report.investigation.rootCause.conclusion} />

        {/* 2.2 Repeat Deviations */}
        <Text style={[styles.bold, { marginTop: 12, marginBottom: 4 }]}>2.2 重复偏差调查 Repeat Deviation Investigation</Text>
        {report.investigation.repeatDeviations.records.length > 0 ? (
          <Table
            headers={['序号 No.', '时间 Time', '偏差编号 Dev. No.', '描述 Description', '根本原因 Root Cause', 'CAPA']}
            rows={report.investigation.repeatDeviations.records.map((r) => [
              r.no,
              r.time,
              r.deviationNo,
              r.description,
              r.rootCause,
              r.capa,
            ])}
          />
        ) : (
          <Text style={styles.text}>无历史偏差记录 No repeat deviations found</Text>
        )}
        <Field label="分析 Analysis" value={report.investigation.repeatDeviations.analysis} />
        <Field label="结论 Conclusion" value={report.investigation.repeatDeviations.conclusion} />

        {/* 2.3 Other Products */}
        <Text style={[styles.bold, { marginTop: 12, marginBottom: 4 }]}>2.3 其他产品或批次调查 Investigation of Other Product or Batch</Text>
        {report.investigation.otherProducts.records.length > 0 ? (
          <Table
            headers={['序号 No.', '产品名称 Product', '批次号 Batch No.', '当前状态 Status']}
            rows={report.investigation.otherProducts.records.map((r) => [
              r.no,
              r.productName,
              r.batchNo,
              r.currentStatus,
            ])}
          />
        ) : (
          <Text style={styles.text}>无其他受影响产品/批次 No other products affected</Text>
        )}
        <Field label="影响分析 Analysis" value={report.investigation.otherProducts.analysis} />
        <Field label="影响结论 Conclusion" value={report.investigation.otherProducts.conclusion} />
      </Section>

      {/* Section 3: Conclusion */}
      <Section title="3. 调查结论 Investigation Conclusion">
        <Field label="根本原因 Root Cause" value={report.conclusion.rootCause} />
        {report.conclusion.mostLikelyCause && (
          <Field label="最有可能原因 Most Likely Cause" value={report.conclusion.mostLikelyCause} />
        )}
      </Section>

      {/* Section 4: Risk Assessment */}
      <Section title="4. 风险分析及影响评估 Risks Analysis and Impact Assessment">
        {(report.riskAssessment.description || '').split('\n').filter(Boolean).map((paragraph, i) => (
          <Text key={i} style={styles.text}>{paragraph}</Text>
        ))}
        {report.riskAssessment.summary && (
          <Text style={[styles.text, styles.bold, { marginTop: 4 }]}>{report.riskAssessment.summary}</Text>
        )}
      </Section>

      {/* Section 5: CAPA */}
      <Section title="5. 纠正预防措施 CAPA">
        <Text style={[styles.bold, { marginBottom: 4 }]}>5.1 纠正措施 Corrective Actions</Text>
        {report.capa.corrections.length > 0 ? (
          <Table
            headers={['CAPA编号 No.', '措施内容 Content', '执行人 Executor', '预期完成 Expected', '签名日期 Signed']}
            rows={report.capa.corrections.map((c) => [
              c.capaNo,
              c.content,
              c.executor,
              c.expectedDate,
              c.signatureDate,
            ])}
          />
        ) : (
          <Text style={styles.text}>无纠正措施 No corrective actions</Text>
        )}

        <Text style={[styles.bold, { marginTop: 12, marginBottom: 4 }]}>5.2 预防措施 Preventive Actions</Text>
        {report.capa.preventions.length > 0 ? (
          <Table
            headers={['CAPA编号 No.', '措施内容 Content', '执行人 Executor', '预期完成 Expected', '签名日期 Signed']}
            rows={report.capa.preventions.map((p) => [
              p.capaNo,
              p.content,
              p.executor,
              p.expectedDate,
              p.signatureDate,
            ])}
          />
        ) : (
          <Text style={styles.text}>无预防措施 No preventive actions</Text>
        )}
      </Section>

      {/* Section 6: Attachments */}
      <Section title="6. 附件清单 Attachment List">
        {report.attachments.length > 0 ? (
          <Table
            headers={['编号 No.', '附件名称 Name', '页数 Pages']}
            rows={report.attachments.map((a) => [a.no, a.name, String(a.pages)])}
          />
        ) : (
          <Text style={styles.text}>无附件 No attachments</Text>
        )}
      </Section>

      {/* Section 7: Version History */}
      <Section title="7. 版本修订历史 Version Revision History">
        {report.versionHistory.length > 0 ? (
          <Table
            headers={['版本号 Version', '执行日期 Date', '修订原因 Reason', '主要变更 Changes']}
            rows={report.versionHistory.map((v) => [
              v.version,
              v.executionDate,
              v.revisionReason,
              v.mainChanges,
            ])}
          />
        ) : (
          <Text style={styles.text}>初始版本 Initial version</Text>
        )}
      </Section>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>由 GMPilot 生成</Text>
        <Text>{new Date().toLocaleDateString('zh-CN')}</Text>
        <Text>仅供内部使用</Text>
      </View>
    </Page>
  );
};

// ============================================================================
// Main Component
// ============================================================================

interface DeviationReportPDFProps {
  report: DeviationReport;
}

export function DeviationReportPDF({ report }: DeviationReportPDFProps) {
  return (
    <Document>
      <CoverPage report={report} />
      <ContentPages report={report} />
    </Document>
  );
}
