/**
 * 404 Not Found page.
 */

import { useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-8">
      <div className="w-16 h-16 rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center mb-5">
        <FileQuestion className="w-7 h-7 text-stone-300" strokeWidth={1.5} />
      </div>
      <h1 className="text-4xl font-bold text-stone-900 font-display mb-2">
        404
      </h1>
      <p className="text-lg text-stone-500 mb-1">
        页面未找到
      </p>
      <p className="text-sm text-stone-400 mb-8">
        您访问的页面不存在或已被移除
      </p>
      <Button onClick={() => navigate('/')} variant="primary">
        返回首页
      </Button>
    </div>
  );
}
