import { cn } from '../lib/cn.js';
import { Logo } from './Logo.js';

interface BrandProps {
  size?: 'sm' | 'md' | 'lg';
  subtle?: boolean;
  className?: string;
  showByline?: boolean;
  onClick?: () => void;
}

export function Brand({ size = 'md', className, showByline = false, onClick }: BrandProps) {
  const isLarge = size === 'lg';
  const isSmall = size === 'sm';
  const logoSize = isLarge ? 42 : isSmall ? 28 : 34;

  const content = (
    <div
      className={cn(
        'flex items-center gap-2.5 select-none transition-all',
        onClick && 'cursor-pointer group hover:opacity-95',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? 'Leave room and go back home' : undefined}
    >
      <Logo size={logoSize} withBackground={true} className="transition-transform group-hover:scale-105" />
      <span
        className={cn(
          'font-brand font-black tracking-tight text-[#fde5b7] group-hover:text-white transition-colors',
          isLarge ? 'text-3xl' : isSmall ? 'text-xl' : 'text-2xl'
        )}
      >
        VYBE
      </span>
      {showByline && (
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#a8a29e] hidden sm:inline ml-1">
          by Hertx
        </span>
      )}
    </div>
  );

  return content;
}
