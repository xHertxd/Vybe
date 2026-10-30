import { cn } from '../lib/cn.js';

interface BrandProps {
  size?: 'sm' | 'md' | 'lg';
  subtle?: boolean;
  className?: string;
}

export function Brand({ size = 'md', subtle = false, className }: BrandProps) {
  const icon = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg';

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      <div
        className={cn(
          'relative grid place-items-center rounded-[13px] border border-white/10',
          'bg-[radial-gradient(120%_120%_at_20%_0%,rgba(139,92,246,0.35),rgba(8,8,13,0.9))]',
          'shadow-[0_8px_30px_-10px_rgba(124,58,237,0.65)]',
          icon
        )}
      >
        <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="brand-bars" x1="3" y1="20" x2="21" y2="4" gradientUnits="userSpaceOnUse">
              <stop stopColor="#22d3ee" />
              <stop offset="0.52" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#f472b6" />
            </linearGradient>
          </defs>
          <path
            d="M4 9v6M8 5v14M12 8.5v7M16 3v18M20 9v6"
            stroke="url(#brand-bars)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 rounded-[13px] ring-1 ring-inset ring-white/10" />
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            'font-display font-bold tracking-[0.22em]',
            text,
            subtle ? 'text-white/85' : 'text-white'
          )}
        >
          VYBE
        </span>
        {size === 'lg' && (
          <span className="mt-1 text-[10px] font-medium tracking-[0.3em] text-white/35">
            LISTEN TOGETHER
          </span>
        )}
      </div>
    </div>
  );
}
