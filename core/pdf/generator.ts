/**
 * PDF generator using react-pdf.
 * Renders deviation report to PDF file.
 */

import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { DeviationReportPDF } from './templates/DeviationReport';
import { createLogger } from '../utils/logger';
import type { DeviationReport } from '../workflow/types';

const log = createLogger('PDF');

// ============================================================================
// Types
// ============================================================================

export interface GeneratePdfOptions {
  report: DeviationReport;
  outputPath?: string;
}

// ============================================================================
// Generator
// ============================================================================

/**
 * Generate PDF from deviation report.
 * Returns a Buffer that can be written to file.
 */
export async function generatePdf(options: GeneratePdfOptions): Promise<Buffer> {
  log.info('Generating PDF', { deviationId: options.report.deviationId });

  const start = Date.now();
  const doc = React.createElement(DeviationReportPDF, {
    report: options.report,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(doc as any);
  const duration = Date.now() - start;

  log.info('PDF rendered', { deviationId: options.report.deviationId, size: `${(buffer.length / 1024).toFixed(1)}KB`, duration: `${duration}ms` });
  return buffer;
}

/**
 * Generate PDF and save to file.
 */
export async function generatePdfToFile(
  options: GeneratePdfOptions,
  filePath: string,
): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const buffer = await generatePdf(options);

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, buffer);
  log.info('PDF saved', { filePath, size: `${(buffer.length / 1024).toFixed(1)}KB` });
  return filePath;
}
