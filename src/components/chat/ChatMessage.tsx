/**
 * Chat message component.
 * Claude-style: AI messages are text-only with subtle left border,
 * user messages are teal bubbles. No avatars.
 */

import { memo, useEffect, useRef } from 'react';
import { gsap } from 'gsap';

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
        y: 8,
        opacity: 0,
        duration: 0.3,
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

  if (isAI) {
    return (
      <div ref={ref} className="group flex justify-start">
        <div className="max-w-[85%] pl-3 border-l-2 border-stone-200 group-hover:border-teal-300 transition-colors duration-200">
          <p className="text-[13.5px] text-stone-700 leading-[1.7] whitespace-pre-wrap">
            {message.content}
          </p>
          <span className="inline-block text-[10px] text-stone-300 mt-1.5 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {timeStr}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="group flex justify-end">
      <div className="max-w-[80%] flex flex-col items-end">
        <div className="bg-teal-600 text-white text-[13.5px] leading-[1.7] px-4 py-2.5 rounded-2xl rounded-br-md whitespace-pre-wrap">
          {message.content}
        </div>
        <span className="text-[10px] text-stone-300 mt-1 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {timeStr}
        </span>
      </div>
    </div>
  );
});
