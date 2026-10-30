import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastMessage } from '../types.js';
import { cn } from '../lib/cn.js';

interface ToastsProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

const toneStyles = {
  info: {
    icon: Info,
    ring: 'border-sand',
    glow: 'shadow-[0_18px_40px_-28px_rgba(35,32,28,0.45)]',
    iconColor: 'text-slate',
  },
  success: {
    icon: CheckCircle2,
    ring: 'border-forest/25',
    glow: 'shadow-[0_18px_40px_-28px_rgba(95,114,89,0.5)]',
    iconColor: 'text-forest',
  },
  error: {
    icon: AlertCircle,
    ring: 'border-rust/30',
    glow: 'shadow-[0_18px_40px_-28px_rgba(162,90,69,0.5)]',
    iconColor: 'text-rust',
  },
} as const;

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
      {toasts.map((toast) => {
        const tone = toneStyles[toast.tone];
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            className={cn(
              'animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-3.5 pr-2.5',
              'glass-soft',
              tone.ring,
              tone.glow
            )}
            role="status"
          >
            <Icon className={cn('mt-0.5 h-5 w-5 flex-none', tone.iconColor)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="icon-btn h-7 w-7 flex-none rounded-lg"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
