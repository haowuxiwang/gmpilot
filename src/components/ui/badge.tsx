import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors',
  {
    variants: {
      variant: {
        teal: 'bg-teal-50 text-teal-700 border-teal-200',
        amber: 'bg-amber-50 text-amber-700 border-amber-200',
        stone: 'bg-stone-100 text-stone-600 border-stone-200',
        red: 'bg-red-50 text-red-600 border-red-200',
        blue: 'bg-blue-50 text-blue-600 border-blue-200',
      },
    },
    defaultVariants: {
      variant: 'teal',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
