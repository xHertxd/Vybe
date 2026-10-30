import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../lib/cn.js';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  hideClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideClose = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-md"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        className={cn(
          'animate-rise relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/10 sm:rounded-3xl',
          'panel',
          className
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6 sm:py-5">
            <div>
              {title && <h2 className="font-display text-lg font-semibold text-white">{title}</h2>}
              {description && (
                <p className="mt-1 text-xs leading-relaxed text-white/45">{description}</p>
              )}
            </div>
            {!hideClose && (
              <button type="button" onClick={onClose} className="icon-btn -mr-1 -mt-1" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className="max-h-[78vh] overflow-y-auto px-5 py-5 scroll-thin sm:px-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} className="max-w-md">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={cn('btn', danger ? 'btn-danger' : 'btn-primary')}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
