import { AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

function ErrorState({
  title = '加载失败',
  description = '数据加载出错，请重试',
  onRetry,
  retryLabel = '重试',
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 px-6 text-center',
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100">
        <AlertCircle className="h-5 w-5 text-stone-400" />
      </div>
      <div>
        <p className="font-body text-sm font-semibold text-stone-700">{title}</p>
        {description ? (
          <p className="mt-1 font-body text-xs text-stone-400">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-all duration-200 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-800"
        >
          <RotateCw className="h-3.5 w-3.5" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export { ErrorState };
