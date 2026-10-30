import { Globe, Heart, Mail } from 'lucide-react';

interface FooterProps {
  compact?: boolean;
}

function GithubIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function YoutubeIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

function InstagramIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

export function Footer({ compact = false }: FooterProps) {
  return (
    <footer
      className={
        compact
          ? 'mx-auto w-full max-w-5xl px-4 py-3 select-none'
          : 'mx-auto w-full max-w-5xl px-4 py-4 select-none'
      }
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-2.5 rounded-2xl sm:rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] shadow-[0_8px_30px_rgba(0,0,0,0.35)] text-xs text-[#a8a29e]">
        {/* Brand & Creator Attribution */}
        <div className="flex items-center gap-1.5 font-medium">
          <span>Made with</span>
          <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400 inline" />
          <span>by</span>
          <a
            href="https://www.xhertxd.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-brand font-black text-[#fde5b7] hover:text-[#40E0D0] transition-colors tracking-wide"
          >
            HERT<span className="text-[#40E0D0]">X</span>
          </a>
        </div>

        {/* Social & Portfolio Links from xhertxd.me */}
        <div className="flex items-center gap-4 text-[11px]">
          <a
            href="https://www.xhertxd.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-[#fde5b7] transition-colors"
            title="Portfolio"
          >
            <Globe className="w-3.5 h-3.5 text-[#40E0D0]" />
            <span className="hidden sm:inline">Portfolio</span>
          </a>

          <a
            href="https://github.com/xhertxd"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-[#fde5b7] transition-colors"
            title="GitHub"
          >
            <GithubIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>

          <a
            href="https://www.youtube.com/@xHertxd"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-[#fde5b7] transition-colors"
            title="YouTube"
          >
            <YoutubeIcon className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">YouTube</span>
          </a>

          <a
            href="https://www.instagram.com/xhertxd"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-[#fde5b7] transition-colors"
            title="Instagram"
          >
            <InstagramIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Instagram</span>
          </a>

          <a
            href="mailto:xhertxd@gmail.com"
            className="flex items-center gap-1 hover:text-[#fde5b7] transition-colors"
            title="Email"
          >
            <Mail className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Contact</span>
          </a>
        </div>

        {/* Copyright */}
        <div className="text-[10px] text-[#71717a] font-mono">
          &copy; {new Date().getFullYear()} Hertx
        </div>
      </div>
    </footer>
  );
}
