interface FooterProps {
  compact?: boolean;
}

export function Footer({ compact = false }: FooterProps) {
  return (
    <footer
      className={
        compact
          ? 'mx-auto w-full max-w-[1480px] px-4 py-3 text-xs text-[#a8a29e] select-none'
          : 'w-full text-center text-xs text-[#a8a29e] py-3 select-none'
      }
    >
      <div className="flex items-center justify-center gap-1.5">
        <span>Made with ❤️ by</span>
        <a
          href="https://www.xhertxd.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#fde5b7] hover:text-white hover:underline transition-colors"
        >
          Hertx
        </a>
      </div>
    </footer>
  );
}
