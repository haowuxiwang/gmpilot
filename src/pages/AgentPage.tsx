/**
 * 智能助手页面
 * 核心交互界面 — 对话 + 文档查看
 * 现代制药极简风格
 */

import { useState, useCallback, useMemo } from 'react';
import { ChatStream } from '@/components/chat/ChatStream';
import { ChatInput } from '@/components/chat/ChatInput';
import { DocumentViewer } from '@/components/document/DocumentViewer';
import { AuditFindingsList, AuditProgress } from '@/components/audit';
import { useDeviationWorkflow } from '@/hooks/useDeviationWorkflow';
import { useAuditBee } from '@/hooks/useAuditBee';
import { useToast } from '@/providers/ToastProvider';
import type { WorkflowStepId } from '@/components/chat/WorkflowProgress';
import type { Message } from '@/components/chat/ChatMessage';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

interface AttachedFile {
  id: string;
  name: string;
  type: 'file' | 'image';
  size: number;
  content?: string;
}

export function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [showAuditDetails, setShowAuditDetails] = useState(false);
  const { success, error: showError, warning } = useToast();

  // Stable callbacks for workflow — memoized to avoid re-renders
  const workflowCallbacks = useMemo(() => ({
    onSuccess: (_report: unknown) => success('偏差报告已生成完成'),
    onError: (err: string) => showError(err),
    onWarning: (msg: string) => warning(msg),
  }), [success, showError, warning]);

  const {
    step,
    loading,
    report,
    progress,
    setClueText,
    runWorkflow,
    exportPdf,
  } = useDeviationWorkflow(workflowCallbacks);

  const streamingText = progress?.analysis
    ? typeof progress.analysis === 'object' &&
      'summary' in progress.analysis
      ? String(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (progress.analysis as any).summary,
        )
      : '正在分析...'
    : undefined;

  const handleSend = useCallback(
    async (content: string, files?: AttachedFile[]) => {
      // 构建消息内容（包含附件信息）
      let messageContent = content;
      if (files && files.length > 0) {
        const fileNames = files.map((f) => f.name).join('、');
        messageContent = content
          ? `${content}\n\n附件：${fileNames}`
          : `附件：${fileNames}`;
      }

      const userMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: messageContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      setClueText(messageContent);

      // 传递文件内容到后端进行解析
      const fileData = files?.map(f => ({ name: f.name, content: f.content }));
      const result = await runWorkflow(content, fileData);

      if (result) {
        const aiMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: result.success
            ? '偏差报告已生成完成。您可以在右侧文档面板查看详细内容，或导出为 PDF。'
            : `生成失败：${result.error}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
      }
    },
    [setClueText, runWorkflow],
  );

  // AuditBee integration
  // Revision handler — re-run workflow with audit findings as context
  const handleRevise = useCallback((revisionPrompt: string) => {
    setShowAuditDetails(false);
    handleSend(revisionPrompt);
  }, [handleSend]);

  const {
    loading: auditLoading,
    stage: auditStage,
    progress: auditProgress,
    findings: auditFindings,
    error: auditError,
    isAvailable: auditAvailable,
    sendToAudit,
    reviseWithFindings,
  } = useAuditBee(report, undefined, handleRevise);

  // Wrap sendToAudit to auto-show panel and details
  const handleSendToAudit = useCallback(async () => {
    setShowPanel(true);
    setShowAuditDetails(true);
    await sendToAudit();
  }, [sendToAudit]);

  const handleQuickAction = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend],
  );

  // Map workflow step to WorkflowStepId
  const workflowStep: WorkflowStepId = step as WorkflowStepId;

  return (
    <div className="flex h-full bg-surface">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top bar */}
        <div className="px-6 py-3.5 border-b border-stone-100 flex items-center justify-end">
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-lg transition-colors"
            title={showPanel ? '隐藏文档面板' : '显示文档面板'}
          >
            {showPanel ? (
              <PanelRightClose className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <PanelRightOpen className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>

        {/* Chat stream */}
        <ChatStream
          messages={messages}
          isStreaming={loading}
          streamingText={streamingText}
          currentStep={workflowStep}
          progress={progress}
          onQuickAction={handleQuickAction}
        />

        {/* Input */}
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>

      {/* Document panel */}
      {showPanel && (
        <div className="w-[400px] flex-shrink-0 border-l border-stone-100 bg-white flex flex-col">
          {/* Show audit details or document viewer */}
          {showAuditDetails && (auditFindings || auditLoading || auditStage === 'failed') ? (
            <div className="flex flex-col h-full">
              {/* Back button */}
              <div className="px-5 py-3 border-b border-stone-100">
                <button
                  onClick={() => setShowAuditDetails(false)}
                  className="text-xs text-teal-600 hover:text-teal-700"
                >
                  &larr; 返回报告
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Progress (if loading) */}
                {auditLoading && (
                  <AuditProgress
                    stage={auditStage}
                    progress={auditProgress}
                    error={auditError}
                    onRetry={handleSendToAudit}
                  />
                )}

                {/* Findings list */}
                {auditFindings && (
                  <AuditFindingsList
                    findings={auditFindings}
                    onRevise={reviseWithFindings}
                  />
                )}

                {/* Error state */}
                {auditStage === 'failed' && !auditLoading && (
                  <AuditProgress
                    stage="failed"
                    progress={0}
                    error={auditError}
                    onRetry={handleSendToAudit}
                  />
                )}
              </div>
            </div>
          ) : (
            <DocumentViewer
              report={report}
              onExportPdf={exportPdf}
              onSendToAudit={handleSendToAudit}
              auditLoading={auditLoading}
              auditFindings={auditFindings}
              auditAvailable={auditAvailable}
              onViewAuditDetails={() => setShowAuditDetails(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}
