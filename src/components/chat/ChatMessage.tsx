/**
 * Chat message component.
 * Clean, modern design using the precision laboratory color system.
 * User messages: right-aligned, teal accent.
 * AI messages: left-aligned, subtle border.
 */

import { memo, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { FlaskConical, User } from 'lucide-react';

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
  const ref = useRef<HTMLDivElement>(null);
  const animRef = useRef<gsap.core.Tween | null>(null);
  const isAI = message.role === 'assistant';

  useEffect(() => {
    if (ref.current) {
      animRef.current = gsap.from(ref.current, {
        y: 10,
        opacity: 0,
        duration: 0.35,
        ease: 'power3.out',
      });
    }
    return () => {
      animRef.current?.kill();
    };
  }, []);

  const timeStr = message.timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      ref={ref}
      className={`flex gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}
    >
      {/* AI avatar */}
      {isAI && (
        <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <FlaskConical
            className="w-4 h-4 text-teal-600"
            strokeWidth={1.5}
          />
        </div>
      )}

      <div
        className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}
      >
        {/* Message bubble */}
        <div
          className={`
            max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
            ${
              isAI
                ? 'bg-white border border-stone-200 text-stone-800 rounded-2xl rounded-tl-md'
                : 'bg-teal-600 text-white rounded-2xl rounded-tr-md shadow-sm shadow-teal-600/10'
            }
          `}
        >
          {message.content}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-stone-400 mt-1.5 px-1 font-mono tracking-wider">
          {timeStr}
        </span>
      </div>

      {/* User avatar */}
      {!isAI && (
        <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User className="w-4 h-4 text-stone-500" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
});
