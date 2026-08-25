import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-body font-semibold text-sm rounded-xl transition-all duration-200 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-teal-600 text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 hover:shadow-md hover:shadow-teal-600/25 hover:-translate-y-[1px] active:translate-y-0',
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
