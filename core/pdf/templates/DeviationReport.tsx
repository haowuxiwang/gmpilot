/**
 * PDF template for GMP deviation report using react-pdf.
 * Professional GMP style with cover page, tables, and structured sections.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DeviationReport } from '../../workflow/types';

// ============================================================================
// Font Registration
// ============================================================================

// Use import.meta.url for reliable path resolution in packaged Electron
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fontPath = path.join(__dirname, '..', '..', '..', '..', 'resources', 'fonts', 'NotoSerifCJKsc-Regular.otf');

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

  // Signature table
  signatureTable: {
    width: '80%',
    border: '1 solid #333',
    marginTop: 20,
    alignSelf: 'center',
  },
  signatureRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #333',
    height: 40,
  },
  signatureLabel: {
    width: 100,
    padding: 8,
    borderRight: '1 solid #333',
    fontWeight: 'bold',
    fontSize: 10,
    backgroundColor: '#f0f0f0',
  },
  signatureValue: {
    flex: 1,
    padding: 8,
    fontSize: 10,
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
      <Field label="偏差编号" value={report.deviationId} />
      <Field label="部门" value={report.cover.department} />
    </View>

    {/* Signature Table */}
    <View style={styles.signatureTable}>
      <View style={styles.signatureRow}>
        <View style={styles.signatureLabel}>
          <Text>起草人</Text>
        </View>
        <View style={styles.signatureValue}>
          <Text>{report.cover.preparedBy.name || '_______________'}</Text>
        </View>
        <View style={[styles.signatureLabel, { borderLeft: '1 solid #333' }]}>
          <Text>日期</Text>
        </View>
        <View style={styles.signatureValue}>
          <Text>{report.cover.preparedBy.signatureDate || '____年____月____日'}</Text>
        </View>
      </View>
      <View style={styles.signatureRow}>
        <View style={styles.signatureLabel}>
          <Text>审核人</Text>
        </View>
        <View style={styles.signatureValue}>
          <Text>{report.cover.reviewedBy.name || '_______________'}</Text>
        </View>
        <View style={[styles.signatureLabel, { borderLeft: '1 solid #333' }]}>
          <Text>日期</Text>
        </View>
        <View style={styles.signatureValue}>
          <Text>{report.cover.reviewedBy.signatureDate || '____年____月____日'}</Text>
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
      <Text style={styles.subtitle}>偏差调查和风险评估报告</Text>
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
      <Section title="1. 背景">
        <Field label="产品" value={report.background.product} />
        <Field label="批次" value={report.background.batch} />
        <Field label="发生时间" value={report.background.occurrenceTime} />
        <Field label="发生地点" value={report.background.location} />
        <Text style={[styles.text, { marginTop: 8 }]}>{report.background.description}</Text>
      </Section>

      {/* Section 2: Investigation */}
      <Section title="2. 偏差调查">
        {/* 2.1 Root Cause */}
        <Text style={[styles.bold, { marginBottom: 4 }]}>2.1 根本原因调查</Text>
        <Field label="人员面谈" value={report.investigation.rootCause.interviews} />
        <Field label="SOP核查" value={report.investigation.rootCause.sopReview} />
        <Field label="历史数据" value={report.investigation.rootCause.historicalData} />
        <Field label="相关批次" value={report.investigation.rootCause.relatedBatches} />
        <Field label="批生产记录" value={report.investigation.rootCause.batchRecords} />
        <Field label="留样审查" value={report.investigation.rootCause.samplesReview} />
        <Field label="稳定性考察" value={report.investigation.rootCause.stabilityStudy} />
        <Field label="供应商审计" value={report.investigation.rootCause.supplierReview} />
        <Field label="调查结论" value={report.investigation.rootCause.conclusion} />

        {/* 2.2 Repeat Deviations */}
        <Text style={[styles.bold, { marginTop: 12, marginBottom: 4 }]}>2.2 重复偏差调查</Text>
        {report.investigation.repeatDeviations.records.length > 0 ? (
          <Table
            headers={['时间', '偏差编号', '描述', '根本原因', 'CAPA']}
            rows={report.investigation.repeatDeviations.records.map((r) => [
              r.time,
              r.deviationNo,
              r.description,
              r.rootCause,
              r.capa,
            ])}
          />
        ) : (
          <Text style={styles.text}>无历史偏差记录</Text>
        )}
        <Field label="分析" value={report.investigation.repeatDeviations.analysis} />
        <Field label="结论" value={report.investigation.repeatDeviations.conclusion} />

        {/* 2.3 Other Products */}
        <Text style={[styles.bold, { marginTop: 12, marginBottom: 4 }]}>2.3 其他产品/批次调查</Text>
        {report.investigation.otherProducts.records.length > 0 ? (
          <Table
            headers={['产品名称', '批次号', '当前状态']}
            rows={report.investigation.otherProducts.records.map((r) => [
              r.productName,
              r.batchNo,
              r.currentStatus,
            ])}
          />
        ) : (
          <Text style={styles.text}>无其他受影响产品/批次</Text>
        )}
        <Field label="分析" value={report.investigation.otherProducts.analysis} />
        <Field label="结论" value={report.investigation.otherProducts.conclusion} />
      </Section>

      {/* Section 3: Conclusion */}
      <Section title="3. 调查结论">
        <Field label="根本原因" value={report.conclusion.rootCause} />
        {report.conclusion.mostLikelyCause && (
          <Field label="最有可能原因" value={report.conclusion.mostLikelyCause} />
        )}
      </Section>

      {/* Section 4: Risk Assessment */}
      <Section title="4. 风险分析">
        <Table
          headers={['评估维度', '影响分析']}
          rows={[
            ['产品质量', report.riskAssessment.qualityImpact],
            ['稳定性', report.riskAssessment.stabilityImpact],
            ['注册', report.riskAssessment.registrationImpact],
            ['客户', report.riskAssessment.customerImpact],
            ['验证', report.riskAssessment.validationImpact],
          ]}
        />
      </Section>

      {/* Section 5: CAPA */}
      <Section title="5. CAPA">
        <Text style={[styles.bold, { marginBottom: 4 }]}>5.1 纠正措施</Text>
        {report.capa.corrections.length > 0 ? (
          <Table
            headers={['CAPA编号', '措施内容', '执行人', '预期完成日期', '签名日期']}
            rows={report.capa.corrections.map((c) => [
              c.capaNo,
              c.content,
              c.executor,
              c.expectedDate,
              c.signatureDate,
            ])}
          />
        ) : (
          <Text style={styles.text}>无纠正措施</Text>
        )}

        <Text style={[styles.bold, { marginTop: 12, marginBottom: 4 }]}>5.2 预防措施</Text>
        {report.capa.preventions.length > 0 ? (
          <Table
            headers={['CAPA编号', '措施内容', '执行人', '预期完成日期', '签名日期']}
            rows={report.capa.preventions.map((p) => [
              p.capaNo,
              p.content,
              p.executor,
              p.expectedDate,
              p.signatureDate,
            ])}
          />
        ) : (
          <Text style={styles.text}>无预防措施</Text>
        )}
      </Section>

      {/* Section 6: Attachments */}
      <Section title="6. 附件清单">
        {report.attachments.length > 0 ? (
          <Table
            headers={['编号', '附件名称', '页数']}
            rows={report.attachments.map((a) => [a.no, a.name, String(a.pages)])}
          />
        ) : (
          <Text style={styles.text}>无附件</Text>
        )}
      </Section>

      {/* Section 7: Version History */}
      <Section title="7. 版本历史">
        {report.versionHistory.length > 0 ? (
          <Table
            headers={['版本号', '执行日期', '修订原因', '主要变更']}
            rows={report.versionHistory.map((v) => [
              v.version,
              v.executionDate,
              v.revisionReason,
              v.mainChanges,
            ])}
          />
        ) : (
          <Text style={styles.text}>初始版本</Text>
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
