interface FooterProps {
  compact?: boolean;
}

export function Footer({ compact = false }: FooterProps) {
  return (
    <footer
      className={
        compact
          ? 'mx-auto w-full max-w-[1580px] px-4 pb-6 pt-2 sm:px-6 lg:px-8'
          : 'mx-auto w-full max-w-[1380px] px-5 pb-8 pt-10 sm:px-8 lg:px-12'
      }
    >
      <div className="flex flex-col items-center justify-between gap-3 border-t border-sand/80 pt-6 text-[11px] text-taupe sm:flex-row">
        <p>
          <span className="font-display text-sm text-ink">Vybe</span>
          <span className="mx-2 text-sand">/</span>
          One beat. Every device.
        </p>
        <p>
          Made by <span className="font-medium text-graphite">Hertx</span>
          <span className="mx-2 text-sand">·</span>
          {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
