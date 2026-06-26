/**
 * Empty state for the chat area.
 * AI tech aesthetic — radial glow, breathing icon, enhanced quick-action cards.
 */

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { FlaskConical, ArrowRight, Scale, Beaker, SprayCan, Cog } from 'lucide-react';

interface EmptyStateProps {
  onQuickAction: (text: string) => void;
}

const QUICK_PROMPTS = [
  {
    label: '片剂重量差异',
    desc: '自动 5M1E 分析',
    text: '片剂生产过程中发现片剂重量差异超出标准范围，需要进行偏差调查分析',
    icon: Scale,
    accent: 'bg-teal-500',
  },
  {
    label: '原料纯度超标',
    desc: '风险等级评估',
    text: '原辅料检验发现纯度指标超出内控标准，需要评估对产品质量的影响',
    icon: Beaker,
    accent: 'bg-amber-500',
  },
  {
    label: '清洁验证偏差',
    desc: '法规匹配检索',
    text: '清洁验证过程中检测到残留物超出可接受标准，需要分析根本原因',
    icon: SprayCan,
    accent: 'bg-sky-500',
  },
  {
    label: '设备故障偏差',
    desc: 'CAPA 措施建议',
    text: '生产设备运行中出现异常停机，可能影响在制产品质量',
    icon: Cog,
    accent: 'bg-violet-500',
  },
];

export function EmptyState({ onQuickAction }: EmptyStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const cardsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.from(containerRef.current, { opacity: 0, duration: 0.4 })
      .from(titleRef.current, { y: 16, opacity: 0, duration: 0.5 }, '-=0.2')
      .from(subtitleRef.current, { y: 12, opacity: 0, duration: 0.4 }, '-=0.3')
      .from(descRef.current, { y: 12, opacity: 0, duration: 0.4 }, '-=0.3')
      .from(
        cardsRef.current.filter(Boolean),
        {
          y: 20,
          opacity: 0,
          duration: 0.4,
          stagger: 0.08,
        },
        '-=0.2',
      );

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-center h-full px-8 overflow-hidden"
    >
      {/* Radial glow backdrop */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full bg-teal-500/[0.06] blur-[100px] pointer-events-none" />

      {/* Icon with breathing animation */}
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-50 to-teal-100/50 border border-teal-100 flex items-center justify-center animate-[breathe_4s_ease-in-out_infinite]">
          <FlaskConical className="w-9 h-9 text-teal-600" strokeWidth={1.5} />
        </div>
        {/* Soft ring */}
        <div className="absolute inset-0 rounded-2xl border border-teal-200/40 scale-110 animate-[breathe_4s_ease-in-out_infinite]" />
      </div>

      {/* Title */}
      <h2
        ref={titleRef}
        className="text-2xl font-bold tracking-tight font-display bg-gradient-to-r from-teal-700 to-teal-500 bg-clip-text text-transparent mb-1.5"
      >
        GMPilot
      </h2>

      {/* Subtitle */}
      <p
        ref={subtitleRef}
        className="text-sm font-medium text-teal-600/80 mb-3"
      >
        AI 驱动的偏差分析助手
      </p>

      {/* Description */}
      <p
        ref={descRef}
        className="text-sm text-stone-500 max-w-md text-center leading-relaxed mb-10"
      >
        描述偏差情况，自动完成线索分析、5M1E 因素识别、法规匹配，并生成符合 GMP 规范的偏差调查报告。
      </p>

      {/* Quick action cards */}
      <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
        {QUICK_PROMPTS.map((prompt, i) => {
          const Icon = prompt.icon;
          return (
            <button
              key={prompt.label}
              ref={(el) => {
                cardsRef.current[i] = el;
              }}
              onClick={() => onQuickAction(prompt.text)}
              className="
                group relative text-left pl-5 pr-4 py-3.5 rounded-xl
                bg-white border border-stone-200
                hover:border-teal-300 hover:shadow-md hover:shadow-teal-500/5 hover:-translate-y-0.5
                active:scale-[0.98] active:shadow-none active:translate-y-0
                transition-all duration-200 ease-out
                overflow-hidden
              "
            >
              {/* Left accent bar */}
              <div className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-full ${prompt.accent} opacity-60 group-hover:opacity-100 transition-opacity`} />

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center flex-shrink-0 group-hover:bg-teal-50 group-hover:border-teal-100 transition-colors">
                  <Icon className="w-4 h-4 text-stone-400 group-hover:text-teal-600 transition-colors" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-700 group-hover:text-teal-700 transition-colors">
                      {prompt.label}
                    </span>
                    <ArrowRight
                      className="w-3.5 h-3.5 text-stone-300 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0"
                      strokeWidth={2}
                    />
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    {prompt.desc}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
