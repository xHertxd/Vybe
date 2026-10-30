interface FooterProps {
  compact?: boolean;
}

export function Footer({ compact = false }: FooterProps) {
  return (
    <footer
      className={
        compact
          ? 'mx-auto w-full max-w-[1480px] px-4 py-4 text-xs text-[#a8a29e]'
          : 'mx-auto w-full max-w-[1280px] px-6 py-8 text-xs text-[#a8a29e]'
      }
    >
      <div className="flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 sm:flex-row">
        <p className="flex items-center gap-2">
          <span className="font-brand text-sm tracking-wider text-[#fde5b7]">VYBE</span>
          <span className="text-white/20">/</span>
          <span className="text-[#a8a29e]">One Beat. Every Device.</span>
        </p>
        <p className="flex items-center gap-1.5">
          <span>Made by</span>
          <span className="font-semibold text-[#fde5b7]">Hertx</span>
        </p>
      </div>
    </footer>
  );
}
