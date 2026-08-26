/**
 * Toast notification component.
 * Clean design with teal accent. Motion (framer-motion) enter/exit animations.
 */

import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { Toast as ToastType } from '@/hooks/useToast';

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const borderColorMap = {
  success: 'border-l-teal-500',
  error: 'border-l-red-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
};

const iconColorMap = {
  success: 'text-teal-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

function ToastItem({ toast, onRemove }: { toast: ToastType; onRemove: (id: string) => void }) {
  const Icon = iconMap[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.15, ease: 'easeIn' } }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={`flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 border-l-[3px] rounded-xl shadow-lg max-w-[360px] ${borderColorMap[toast.type]}`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 ${iconColorMap[toast.type]}`} />
      <span className="flex-1 text-sm text-stone-700">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="p-1 rounded-lg hover:bg-stone-100 hover:rotate-90 transition-colors duration-200 text-stone-400 hover:text-stone-600"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
}
