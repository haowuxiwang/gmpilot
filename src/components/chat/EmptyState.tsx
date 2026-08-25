/**
 * Empty state — 编辑式极简
 * 温暖衬线标题 + 柔和无衬线副标题，无列表无图标
 * 参考：Claude warm editorial + editorial typography
 */

import { useEffect } from 'react';
import { loadSerifFont } from '@/lib/fonts';

export function EmptyState() {
  useEffect(() => {
    loadSerifFont();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 animate-fade-in">
      {/* 编辑式标题 — 衬线 + 紧凑行高 + 收紧字间距 */}
      <div className="text-center mb-6 max-w-md">
        <h1 className="serif-title font-serif text-[22px] font-medium text-stone-800 leading-[1.35] tracking-tight mb-3 cursor-default">
          每一次偏差
          <br />
          都值得认真对待
        </h1>
        <p className="text-[13px] text-stone-500 leading-relaxed transition-colors duration-300 hover:text-stone-700">
          描述偏差情况，AI 将为您完成调查分析、法规匹配，生成 GMP 合规报告
        </p>
      </div>
    </div>
  );
}
