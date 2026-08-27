/**
 * Intermediate result display component.
 * Shows analysis/factors/streaming report during workflow execution.
 * Clean, compact card with step indicator.
 */

import { motion } from 'motion/react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface IntermediateResultProps {
  title: string;
  step: number;
  content: string;
  isStreaming?: boolean;
}

export function IntermediateResult({
  title,
  step,
  content,
  isStreaming,
}: IntermediateResultProps) {
  if (!content) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white border border-stone-100 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-stone-50 bg-stone-50/50">
        {isStreaming ? (
          <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" strokeWidth={2} />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" strokeWidth={2} />
        )}
        <span className="text-xs font-medium text-stone-700">
          {title}
        </span>
        <span className="text-[10px] text-stone-400 font-mono ml-auto">
          步骤 {step}
        </span>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-0.5 h-3 bg-teal-500 ml-0.5 animate-pulse align-middle" />
          )}
        </p>
      </div>
    </motion.div>
  );
}
