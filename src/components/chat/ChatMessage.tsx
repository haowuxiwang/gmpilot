/**
 * Chat message component.
 * Claude-style: AI messages are text-only with subtle left border,
 * user messages are teal bubbles. No avatars.
 */

import { memo } from 'react';
import { motion } from 'motion/react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isAI = message.role === 'assistant';

  const timeStr = message.timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isAI) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="group flex justify-start"
      >
        <div className="max-w-[85%] pl-3 border-l-2 border-stone-200 group-hover:border-teal-300 transition-colors duration-200">
          <p className="text-[13.5px] text-stone-700 leading-[1.7] whitespace-pre-wrap">
            {message.content}
          </p>
          <span className="inline-block text-[10px] text-stone-300 mt-1.5 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {timeStr}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="group flex justify-end"
    >
      <div className="max-w-[80%] flex flex-col items-end">
        <div className="bg-teal-600 text-white text-[13.5px] leading-[1.7] px-4 py-2.5 rounded-2xl rounded-br-md whitespace-pre-wrap">
          {message.content}
        </div>
        <span className="text-[10px] text-stone-300 mt-1 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {timeStr}
        </span>
      </div>
    </motion.div>
  );
});
