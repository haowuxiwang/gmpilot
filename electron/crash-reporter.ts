/**
 * Local crash reporter for internal deployment.
 * Writes crash reports to logs/crashes/ directory as JSON files.
 * No external service required — suitable for air-gapped environments.
 */

import { app, crashReporter } from 'electron';
import path from 'path';
import fs from 'fs';
import { createLogger } from '../core/utils/logger';
import { getLogsDirPath } from '../core/utils/paths';

const log = createLogger('CrashReporter');

/**
 * Initialize Electron's built-in crash reporter.
 * Crash dumps are saved to logs/crashes/ directory.
 */
export function initCrashReporter(): void {
  const crashesDir = path.join(getLogsDirPath(), 'crashes');

  // Ensure crashes directory exists
  if (!fs.existsSync(crashesDir)) {
    fs.mkdirSync(crashesDir, { recursive: true });
  }

  crashReporter.start({
    productName: 'GMPilot',
    companyName: 'Internal',
    submitURL: '', // No remote submission — local only
    uploadToServer: false,
    ignoreSystemCrashHandler: false,
    extra: {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    },
  });

  log.info('Crash reporter initialized', { crashesDir });

  // Clean up old crash reports (keep last 30 days)
  cleanOldCrashes(crashesDir);
}

/**
 * Write a structured error report (for application-level errors).
 * Called from uncaughtException/unhandledRejection handlers.
 */
export function writeErrorReport(error: Error, context: string): string {
  const crashesDir = path.join(getLogsDirPath(), 'crashes');
  if (!fs.existsSync(crashesDir)) {
    fs.mkdirSync(crashesDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `error-${timestamp}.json`;
  const filePath = path.join(crashesDir, filename);

  const report = {
    type: 'application-error',
    context,
    timestamp: new Date().toISOString(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
    log.info('Error report written', { filePath });
  } catch (writeError) {
    log.error('Failed to write error report', { error: String(writeError) });
  }

  return filePath;
}

/**
 * Get list of recent crash reports.
 */
export function getCrashReports(limit = 10): { filename: string; date: string; size: number }[] {
  const crashesDir = path.join(getLogsDirPath(), 'crashes');
  if (!fs.existsSync(crashesDir)) return [];

  return fs.readdirSync(crashesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const stat = fs.statSync(path.join(crashesDir, f));
      return { filename: f, date: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

/**
 * Clean crash reports older than 30 days.
 */
function cleanOldCrashes(crashesDir: string): void {
  try {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();
    const files = fs.readdirSync(crashesDir);

    let cleaned = 0;
    for (const file of files) {
      const filePath = path.join(crashesDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.info('Cleaned old crash reports', { count: cleaned });
    }
  } catch {
    // Non-critical, ignore
  }
}
