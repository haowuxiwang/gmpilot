/**
 * 智能助手页面
 * 核心交互界面 — 对话 + 文档查看
 * 方案 A：两栏收敛（导航 + 聊天区，历史浮层，报告自动滑出）
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { ChatStream } from '@/components/chat/ChatStream';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatHistory } from '@/components/chat/ChatHistory';
import { createLogger } from '@core/utils/logger';
import { DocumentViewer } from '@/components/document/DocumentViewer';
import { AuditFindingsList } from '@/components/audit';
import { useDeviationWorkflow } from '@/hooks/useDeviationWorkflow';
import { useToast } from '@/providers/ToastProvider';
import type { WorkflowStepId } from '@/components/chat/WorkflowProgress';
import type { Message } from '@/components/chat/ChatMessage';
import type { AuditFinding } from '@core/llm/caller';
import { mapFindingsToModules } from '@core/workflow/module-utils';
import { AnimatePresence, motion } from 'motion/react';
import { PanelRightClose, PanelRightOpen, Square, History, AlertTriangle } from 'lucide-react';

const log = createLogger('AgentPage');

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
  const [showHistory, setShowHistory] = useState(false);
  // fallback 章节（模板兜底）——持久显示在文档面板顶部横幅，直到用户下次生成
  const [fallbackModules, setFallbackModules] = useState<string[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const { success, error: showError, warning } = useToast();

  // Stable callbacks for workflow
  const workflowCallbacks = useMemo(() => ({
    onSuccess: (_report: unknown) => success('偏差报告已生成完成'),
    onError: (err: string) => showError(err),
    onWarning: (msg: string) => warning(msg),
    onExported: (type: 'pdf' | 'docx', filePath?: string) =>
      success(type === 'pdf' ? (filePath ? `PDF 已导出: ${filePath}` : 'PDF 已导出') : 'Word 已导出'),
  }), [success, showError, warning]);

  const {
    step,
    loading,
    exporting,
    report,
    progress,
    auditFindings,
    auditScore,
    auditSummary,
    setClueText,
    runWorkflow,
    cancelWorkflow,
    exportPdf,
    exportDocx,
    reviseTargeted,
  } = useDeviationWorkflow(workflowCallbacks);

  // 有报告时自动滑出文档面板
  useEffect(() => {
    if (report) setShowPanel(true);
  }, [report]);

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
      setMessages((prev) => [...prev, userMessage].slice(-100));
      setClueText(messageContent);

      const fileData = files?.map(f => ({ name: f.name, content: f.content }));
      const result = await runWorkflow(content, fileData);

      if (result) {
        if (result.success && result.fallbackModules && result.fallbackModules.length > 0) {
          setFallbackModules(result.fallbackModules);
          warning(`部分章节（${result.fallbackModules.join('、')}）生成失败，已使用模板内容兜底，请人工补充`);
        } else if (result.success) {
          setFallbackModules([]);
        }
        const aiMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: result.success
            ? '偏差报告已生成完成。您可以在右侧文档面板查看详细内容，或导出为 PDF。'
            : `生成失败：${result.error}`,
          timestamp: new Date(),
        };
        setMessages((prev) => {
          const newMessages = [...prev, aiMessage].slice(-100);
          setTimeout(() => {
            const title = userMessage.content.slice(0, 50) || '新对话';
            const messagesJson = JSON.stringify(newMessages);
            if (currentConversationId) {
              window.gmpilot.db.updateConversation(currentConversationId, title, messagesJson);
            } else {
              window.gmpilot.db.createConversation({ title, messages_json: messagesJson }).then(r => {
                if (r.success && r.id) setCurrentConversationId(r.id);
              }).catch((err) => log.error('Failed to create conversation', { error: String(err) }));
            }
          }, 100);
          return newMessages;
        });
      }
    },
    [setClueText, runWorkflow, currentConversationId],
  );

  const handleRevise = useCallback(async () => {
    if (!auditFindings || auditFindings.length === 0) return;
    const findings = auditFindings as AuditFinding[];
    const targets = mapFindingsToModules(findings);
    const revisionContext = findings
      .map((f, i) => {
        const parts = [`${i + 1}. [${f.severity}] ${f.title}`];
        if (f.description) parts.push(`问题: ${f.description}`);
        if (f.suggestion) parts.push(`建议: ${f.suggestion}`);
        if (f.regulation_ref) parts.push(`法规: ${f.regulation_ref}`);
        return parts.join(' | ');
      })
      .join('\n');

    setShowAuditDetails(false);
    const result = await reviseTargeted(targets, revisionContext);
    if (result.success) {
      // IPC 层修订后已重新审计：有审计结果时明确提示，否则只提示修订完成
      success((result.auditFindings && result.auditFindings.length > 0)
        ? '定向修订完成，已重新审核'
        : '定向修订完成');
    }
  }, [auditFindings, reviseTargeted, success]);

  const handleSelectConversation = useCallback(async (id: number) => {
    try {
      const conversation = await window.gmpilot.db.getConversation(id);
      if (conversation) {
        setCurrentConversationId(id);
        // timestamp 经 JSON 序列化为 ISO 字符串，回读需恢复为 Date（ChatMessage 调 toLocaleTimeString）
        const messages = (JSON.parse(conversation.messages_json) as Message[]).map((m) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        setMessages(messages);
        setShowHistory(false);
      }
    } catch (error) {
      log.error('Failed to load conversation', { error: String(error) });
      showError('加载对话失败');
    }
  }, [showError]);

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
    setShowHistory(false);
  }, []);

  const workflowStep: WorkflowStepId = step as WorkflowStepId;

  return (
    <div className="relative flex h-full bg-white overflow-hidden">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — 左侧上下文 + 右侧操作 */}
        <div className="px-4 py-2.5 border-b border-stone-100 flex items-center justify-between">
          {/* 左侧：对话标题 */}
          <div className="flex items-center gap-2 min-w-0">
            {messages.length > 0 && (
              <>
                <span className="text-stone-200 text-[10px]">·</span>
                <span className="text-[11px] text-stone-400 truncate max-w-[200px]">
                  {messages[0]?.content?.slice(0, 20) || '新对话'}
                </span>
              </>
            )}
          </div>

          {/* 右侧：操作按钮 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-lg transition-colors ${
                showHistory
                  ? 'text-teal-600 bg-teal-50'
                  : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
              }`}
              title="历史对话"
            >
              <History className="w-[16px] h-[16px]" strokeWidth={1.5} />
            </button>

            {loading && (
              <button
                onClick={cancelWorkflow}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                title="停止生成"
              >
                <Square className="w-2.5 h-2.5" fill="currentColor" />
                停止
              </button>
            )}

            <button
              onClick={() => setShowPanel(!showPanel)}
              disabled={!report}
              className={`p-2 rounded-lg transition-colors ${
                showPanel
                  ? 'text-teal-600 bg-teal-50'
                  : report
                    ? 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
                    : 'text-stone-200 cursor-not-allowed'
              }`}
              title={showPanel ? '隐藏文档' : '显示文档'}
            >
              {showPanel ? (
                <PanelRightClose className="w-[16px] h-[16px]" strokeWidth={1.5} />
              ) : (
                <PanelRightOpen className="w-[16px] h-[16px]" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        {/* Chat stream */}
        <ChatStream
          messages={messages}
          isStreaming={loading}
          streamingText={streamingText}
          currentStep={workflowStep}
          progress={progress}
        />

        {/* Input */}
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>

      {/* 历史对话浮层 */}
      {showHistory && (
        <>
          <div
            className="absolute inset-0 z-40 animate-fade-out"
            style={{ background: 'rgba(0,0,0,0.15)', animationDuration: '0.15s' }}
            onClick={() => setShowHistory(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 z-50 w-[280px] shadow-xl animate-slide-in-left">
            <ChatHistory
              currentConversationId={currentConversationId}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onClose={() => setShowHistory(false)}
            />
          </div>
        </>
      )}

      {/* 文档面板 — 有报告时弹簧滑出（motion layout：宽度过渡由 spring 驱动而非线性 width） */}
      <AnimatePresence initial={false}>
        {showPanel && report && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{
              width: 380,
              opacity: 1,
              transition: { type: 'spring', stiffness: 170, damping: 22 },
            }}
            exit={{ width: 0, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
            className="flex-shrink-0 border-l border-stone-100 bg-white flex flex-col max-h-full overflow-hidden"
          >
          {/* fallback 横幅：模板兜底的章节需要人工复核，常驻显示直至下次成功生成 */}
          {fallbackModules.length > 0 && report && (
            <div className="px-4 py-2.5 bg-amber-50 border-b-2 border-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-800">
                  {fallbackModules.length} 个章节使用模板兜底
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {fallbackModules.join('、')} 生成失败，内容为模板默认值，请人工核实补充
                </p>
              </div>
            </div>
          )}
          {showAuditDetails && auditFindings ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b border-stone-100">
                <button
                  onClick={() => setShowAuditDetails(false)}
                  className="text-xs text-teal-600 hover:text-teal-700"
                >
                  ← 返回报告
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AuditFindingsList
                  findings={auditFindings as AuditFinding[]}
                  overallScore={auditScore}
                  summary={auditSummary}
                  onRevise={handleRevise}
                />
              </div>
            </div>
          ) : (
            <DocumentViewer
              report={report}
              onExportPdf={exportPdf}
              onExportDocx={exportDocx}
              exportingType={exporting}
              auditFindings={auditFindings as AuditFinding[] | null}
              auditScore={auditScore}
              onViewAuditDetails={() => setShowAuditDetails(true)}
            />
          )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
