import { cn } from '../lib/cn.js';

interface WaveformProps {
  playing: boolean;
  bars?: number;
  className?: string;
  barClassName?: string;
}

export function Waveform({ playing, bars = 56, className, barClassName }: WaveformProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('flex h-12 items-center justify-center gap-[3px] overflow-hidden', className)}
    >
      {Array.from({ length: bars }, (_, index) => {
        const height =
          0.16 +
          Math.abs(Math.sin(index * 0.62 + 0.4)) * 0.34 +
          Math.abs(Math.cos(index * 0.21)) * 0.32 +
          (index % 5 === 0 ? 0.14 : 0);
        const delay = (index % 13) * 60;
        return (
          <span
            key={index}
            className={cn(
              'w-[3px] flex-none rounded-full bg-gradient-to-t from-violet-500/80 via-fuchsia-400/90 to-cyan-300',
              playing && 'eq-bar',
              barClassName
            )}
            style={{
              height: `${Math.round(Math.min(1, height) * 100)}%`,
              animationDelay: `${delay}ms`,
              animationDuration: `${760 + (index % 7) * 90}ms`,
              opacity: 0.55 + Math.min(0.45, height * 0.4),
            }}
          />
        );
      })}
    </div>
  );
}
