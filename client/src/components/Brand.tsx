import { cn } from '../lib/cn.js';

interface BrandProps {
  size?: 'sm' | 'md' | 'lg';
  subtle?: boolean;
  className?: string;
  showByline?: boolean;
}

export function Brand({ size = 'md', subtle = false, className, showByline = false }: BrandProps) {
  const icon = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const text = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl';

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      <div
        className={cn(
          'grid place-items-center rounded-[11px] bg-ink text-cream',
          icon
        )}
      >
        <svg viewBox="0 0 24 24" className="h-[54%] w-[54%]" fill="none" aria-hidden="true">
          <path
            d="M4 9v6M8 5v14M12 8.5v7M16 3v18M20 9v6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            'font-display font-semibold tracking-[-0.01em]',
            text,
            subtle ? 'text-slate' : 'text-ink'
          )}
        >
          Vybe
        </span>
        {(showByline || size === 'lg') && (
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.24em] text-taupe">
            by Hertx
          </span>
        )}
      </div>
    </div>
  );
}
