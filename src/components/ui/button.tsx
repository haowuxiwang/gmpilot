import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-body font-semibold text-sm rounded-xl transition-all duration-200 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-br from-teal-600 to-teal-700 text-white shadow-[0_2px_8px_rgba(13,148,136,0.25)] hover:from-teal-500 hover:to-teal-600 hover:shadow-[0_4px_16px_rgba(13,148,136,0.35)] hover:-translate-y-[1px]',
        secondary:
          'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-300',
        ghost:
          'text-stone-600 hover:bg-stone-100 hover:text-stone-800',
        danger:
          'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:border-red-300',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-5 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
