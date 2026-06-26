/**
 * Chat stream component.
 * Displays messages, workflow progress, intermediate results, and streaming state.
 * Uses the precision laboratory design system.
 */

import { useRef, useEffect } from 'react';
import { ChatMessage, type Message } from './ChatMessage';
import { EmptyState } from './EmptyState';
import {
  WorkflowProgress,
  type WorkflowStepId,
} from './WorkflowProgress';
import { IntermediateResult } from './IntermediateResult';
import type { WorkflowProgress as WorkflowProgressType } from '@/hooks/useDeviationWorkflow';

interface ChatStreamProps {
  messages: Message[];
  isStreaming?: boolean;
  streamingText?: string;
  currentStep?: WorkflowStepId;
  progress?: WorkflowProgressType | null;
  onQuickAction?: (text: string) => void;
}

export function ChatStream({
  messages,
  isStreaming,
  streamingText,
  currentStep,
  progress,
  onQuickAction,
}: ChatStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, progress?.analysis, progress?.factors, progress?.streamingReport]);

  const showEmpty = messages.length === 0 && !isStreaming;
  const showProgress =
    isStreaming &&
    currentStep &&
    currentStep !== 'input' &&
    currentStep !== 'review';

  // 优化5: 判断是否显示中间结果
  const showAnalysis = isStreaming && progress?.analysis && currentStep && ['identifying', 'matching', 'generating'].includes(currentStep);
  const showFactors = isStreaming && progress?.factors && currentStep && ['matching', 'generating'].includes(currentStep);
  const showStreamingReport = isStreaming && progress?.streamingReport && currentStep === 'generating';

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      {/* Empty state */}
      {showEmpty && (
        <EmptyState onQuickAction={onQuickAction || (() => {})} />
      )}

      {/* Workflow progress bar */}
      {showProgress && (
        <div className="sticky top-0 z-10 bg-[var(--color-surface)]/80 backdrop-blur-sm border-b border-stone-100">
          <WorkflowProgress currentStep={currentStep} />
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="px-6 py-6 space-y-5 max-w-3xl mx-auto">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </div>
      )}

      {/* 优化5: 中间结果预览 */}
      {isStreaming && (showAnalysis || showFactors || showStreamingReport) && (
        <div className="px-6 pb-4 max-w-3xl mx-auto space-y-3">
          {showAnalysis && (
            <IntermediateResult
              title="线索分析"
              step={2}
              content={(progress.analysis as { summary?: string })?.summary || '分析完成'}
            />
          )}
          {showFactors && (
            <IntermediateResult
              title="5M1E 因素识别"
              step={3}
              content={formatFactors(progress.factors)}
            />
          )}
          {showStreamingReport && (
            <IntermediateResult
              title="报告生成中"
              step={4}
              content={formatStreamingReport(progress.streamingReport)}
              isStreaming
            />
          )}
        </div>
      )}

      {/* Streaming indicator */}
      {isStreaming && messages.length > 0 && !showStreamingReport && (
        <div className="px-6 pb-6 max-w-3xl mx-auto">
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-4 h-4 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
            <div className="flex flex-col items-start">
              <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-md px-4 py-3 max-w-[85%]">
                {streamingText ? (
                  <span className="text-sm text-stone-700 whitespace-pre-wrap">
                    {streamingText}
                    <span className="inline-block w-0.5 h-4 bg-teal-500 ml-0.5 animate-pulse align-middle" />
                  </span>
                ) : (
                  <span className="text-sm text-stone-400">
                    正在分析...
                  </span>
                )}
              </div>
              <span className="text-[10px] text-stone-400 mt-1.5 px-1 font-mono tracking-wider">
                分析中
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatFactors(factors: any): string {
  if (!factors) return '';
  const parts: string[] = [];
  if (factors.man?.length) parts.push(`人: ${factors.man.join('、')}`);
  if (factors.machine?.length) parts.push(`机: ${factors.machine.join('、')}`);
  if (factors.material?.length) parts.push(`料: ${factors.material.join('、')}`);
  if (factors.method?.length) parts.push(`法: ${factors.method.join('、')}`);
  if (factors.environment?.length) parts.push(`环: ${factors.environment.join('、')}`);
  return parts.join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatStreamingReport(report: any): string {
  if (!report) return '';
  const parts: string[] = [];
  if (report.title) parts.push(report.title);
  if (report.cover?.title) parts.push(report.cover.title);
  if (report.background?.description) parts.push(report.background.description);
  if (report.investigation?.rootCause?.conclusion) parts.push(`根本原因: ${report.investigation.rootCause.conclusion}`);
  if (report.conclusion?.rootCause) parts.push(`结论: ${report.conclusion.rootCause}`);
  return parts.join('\n\n') || '正在生成报告内容...';
}
