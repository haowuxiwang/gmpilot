/**
 * AuditBeeStatus - Connection status indicator and settings for AuditBee.
 * Used in the Settings page and Sidebar.
 */

import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui';
import { auditbeeApi } from '../../services/auditbee-api';
import { cn } from '../../lib/utils';

interface AuditBeeStatusProps {
  /** Show full settings form (for Settings page) */
  showSettings?: boolean;
}

export function AuditBeeStatus({ showSettings = false }: AuditBeeStatusProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const result = await auditbeeApi.checkHealth();
      setIsAvailable(result.available);
    } catch {
      setIsAvailable(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Compact status indicator (for Sidebar)
  if (!showSettings) {
    return (
      <div className="flex items-center gap-2">
        {checking ? (
          <Loader2 className="w-3 h-3 text-stone-400 animate-spin" />
        ) : isAvailable ? (
          <div className="w-2 h-2 rounded-full bg-teal-500" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-stone-300" />
        )}
        <span className="text-xs text-stone-400">
          AuditBee {isAvailable ? '已连接' : '未连接'}
        </span>
      </div>
    );
  }

  // Full settings form (for Settings page)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isAvailable ? (
            <Wifi className="w-5 h-5 text-teal-600" />
          ) : (
            <WifiOff className="w-5 h-5 text-stone-400" />
          )}
          <div>
            <p className="text-sm font-medium text-stone-800">AuditBee 连接状态</p>
            <p className="text-xs text-stone-400">
              {isAvailable === null
                ? '检查中...'
                : isAvailable
                  ? '服务运行中，可以执行审计'
                  : '服务未启动，请先启动 AuditBee'}
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={checkHealth}
          disabled={checking}
        >
          {checking ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          测试连接
        </Button>
      </div>

      {/* Status indicator */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-3 rounded-xl border',
          isAvailable
            ? 'bg-teal-50 border-teal-200'
            : isAvailable === false
              ? 'bg-stone-50 border-stone-200'
              : 'bg-stone-50 border-stone-200',
        )}
      >
        <div
          className={cn(
            'w-2.5 h-2.5 rounded-full',
            isAvailable
              ? 'bg-teal-500'
              : isAvailable === false
                ? 'bg-stone-300'
                : 'bg-stone-200',
          )}
        />
        <span className="text-sm text-stone-600">
          {isAvailable === null
            ? '正在检查...'
            : isAvailable
              ? '已连接到 AuditBee 服务'
              : '未连接 - 请确保 AuditBee 正在运行 (localhost:8000)'}
        </span>
      </div>
    </div>
  );
}
