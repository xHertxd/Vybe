import { cn } from '../lib/cn.js';

interface BrandProps {
  size?: 'sm' | 'md' | 'lg';
  subtle?: boolean;
  className?: string;
  showByline?: boolean;
}

export function Brand({ size = 'md', className, showByline = false }: BrandProps) {
  const isLarge = size === 'lg';
  const isSmall = size === 'sm';

  return (
    <div className={cn('flex items-center gap-3 select-none', className)}>
      <div className="bg-[#fde5b7] text-black px-4 py-1.5 rounded-br-2xl font-brand font-black tracking-tighter shadow-sm flex items-center justify-center">
        <span className={isLarge ? 'text-3xl' : isSmall ? 'text-lg' : 'text-xl'}>
          VYBE
        </span>
      </div>
      {showByline && (
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#a8a29e] hidden sm:inline">
          by Hertx
        </span>
      )}
    </div>
  );
}
