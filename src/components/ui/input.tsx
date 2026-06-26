import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Prefix icon or element (e.g., search icon) */
  prefix?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, prefix, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-semibold text-stone-700"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {prefix && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">
              {prefix}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full py-2.5 text-sm text-stone-900 bg-white border rounded-xl outline-none transition-all duration-200',
              'placeholder:text-stone-400',
              'focus:border-teal-400 focus:ring-[3px] focus:ring-teal-600/10',
              prefix ? 'pl-9 pr-3.5' : 'px-3.5',
              error
                ? 'border-red-400 focus:border-red-400 focus:ring-red-600/10'
                : 'border-stone-200',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs text-stone-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
