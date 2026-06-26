/**
 * Re-export useToast from ToastProvider.
 * This file exists for backward compatibility — prefer importing from @/providers/ToastProvider.
 */

export { useToast, type ToastType, type Toast } from '@/providers/ToastProvider';
