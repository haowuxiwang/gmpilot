/**
 * Auto-updater module using electron-updater.
 * Supports NSIS (Windows) updates via generic server or GitHub releases.
 * 
 * For internal deployment, configure UPDATE_SERVER_URL in config/.env:
 *   UPDATE_SERVER_URL=https://your-internal-server.com/updates
 */

import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow, dialog } from 'electron';
import { createLogger } from '../core/utils/logger';

const log = createLogger('Updater');

let updateAvailable = false;

/**
 * Initialize auto-updater.
 * Call after app is ready.
 */
export function initAutoUpdater(): void {
  // Skip in development
  if (!app.isPackaged) {
    log.info('Auto-updater disabled in development mode');
    return;
  }

  // Configure update server (optional — defaults to GitHub releases)
  const updateUrl = process.env.UPDATE_SERVER_URL;
  if (updateUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
    log.info('Update server configured', { url: updateUrl });
  }

  autoUpdater.autoDownload = false; // Ask user before downloading
  autoUpdater.autoInstallOnAppQuit = true;

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    updateAvailable = true;
    log.info('Update available', { version: info.version, releaseDate: info.releaseDate });

    // Notify user
    notifyRenderer('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });

    // Ask user to download
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: '发现新版本',
        message: `GMPilot v${info.version} 可用`,
        detail: '是否立即下载更新？下载完成后将在下次启动时安装。',
        buttons: ['下载更新', '稍后提醒'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No updates available');
    notifyRenderer('update-not-available', {});
  });

  autoUpdater.on('download-progress', (progress) => {
    notifyRenderer('update-download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', { version: info.version });
    notifyRenderer('update-downloaded', { version: info.version });

    // Ask to restart
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: '更新已就绪',
        message: `v${info.version} 已下载完成`,
        detail: '重启应用以完成更新。',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  autoUpdater.on('error', (error) => {
    log.warn('Auto-updater error', { error: error.message });
    notifyRenderer('update-error', { error: error.message });
  });

  // Check for updates on startup (delayed)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('Update check failed', { error: err.message });
    });
  }, 5000);

  // Periodic check every 4 hours
  setInterval(() => {
    if (!updateAvailable) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, 4 * 60 * 60 * 1000);

  log.info('Auto-updater initialized');
}

/**
 * Manually trigger update check (from Settings UI).
 */
export async function checkForUpdates(): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo) {
      const currentVersion = app.getVersion();
      const available = result.updateInfo.version !== currentVersion;
      return { available, version: result.updateInfo.version };
    }
    return { available: false };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Send update status to renderer process.
 */
function notifyRenderer(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(`updater:${channel}`, data);
    }
  });
}
