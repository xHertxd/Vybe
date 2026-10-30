import { useEffect, useRef, useState } from 'react';
import { Pencil, Check, AlertCircle, ArrowRight, Shuffle, Loader2, Sparkles } from 'lucide-react';
import { Footer } from '../components/Footer.js';
import { Logo } from '../components/Logo.js';

interface RoomEntryPageProps {
  onCreate: (username: string) => void;
  onJoin: (roomCode: string, username: string) => void;
  initialUsername?: string;
  initialCode?: string;
}

const RANDOM_NAMES = [
  'Nova',
  'Zephyr',
  'Solaris',
  'Aura',
  'Vesper',
  'Zenith',
  'Cosmo',
  'Lyric',
  'Rhythm',
  'Pulse',
  'Astral',
  'Blaze',
  'Echo',
  'Mirage',
  'Apex',
  'Haven',
  'Helix',
  'Orbit',
  'Solstice',
  'Vortex',
  'Prism',
  'Flux',
  'Nexus',
  'Siren',
  'Phantom',
  'Kismet',
  'Drift',
  'Sonic',
];

function generateRandomUsername(): string {
  const idx = Math.floor(Math.random() * RANDOM_NAMES.length);
  return RANDOM_NAMES[idx];
}

const USERNAME_RE = /^[A-Za-z]{2,20}$/;

function unlockAudio(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      if (ctx.state === 'suspended') void ctx.resume();
    }

    // Prime HTML5 audio tag within this user gesture so joiners start playing immediately
    const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
    silent.volume = 0.01;
    void silent.play().catch(() => {});
  } catch {
    // ignore
  }
}

export function RoomEntryPage({
  onCreate,
  onJoin,
  initialUsername,
  initialCode,
}: RoomEntryPageProps) {
  const [username, setUsername] = useState<string>(() => {
    return initialUsername && USERNAME_RE.test(initialUsername)
      ? initialUsername
      : generateRandomUsername();
  });

  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState(username);
  const [digits, setDigits] = useState<string[]>(() => {
    if (initialCode && /^\d{6}$/.test(initialCode)) {
      return initialCode.split('');
    }
    return ['', '', '', '', '', ''];
  });
  const [error, setError] = useState<string | null>(null);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autoJoinTriggered = useRef(false);

  const currentCode = digits.join('');
  const isFullCode = currentCode.length === 6 && /^\d{6}$/.test(currentCode);

  const submitJoin = (code: string, user: string) => {
    unlockAudio();
    setIsAutoSubmitting(true);
    onJoin(code, user);
  };

  useEffect(() => {
    if (initialCode && /^\d{6}$/.test(initialCode)) {
      autoJoinTriggered.current = false; // allow re-join on username change
      setDigits(initialCode.split(''));
      const timer = setTimeout(() => {
        submitJoin(initialCode, username);
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [initialCode, username]);

  const handleSaveUsername = () => {
    const clean = tempUsername.trim();
    if (!USERNAME_RE.test(clean)) {
      setError('Username must be 2–20 letters only (A–Z).');
      return;
    }
    setUsername(clean);
    setIsEditingUsername(false);
    setError(null);
  };

  const handleShuffleUsername = () => {
    let next = generateRandomUsername();
    while (next === username) {
      next = generateRandomUsername();
    }
    setUsername(next);
    setTempUsername(next);
    setError(null);
  };

  const handleDigitChange = (index: number, val: string) => {
    setError(null);
    const numeric = val.replace(/\D/g, '');

    if (numeric.length <= 1) {
      const newDigits = [...digits];
      newDigits[index] = numeric;
      setDigits(newDigits);

      if (numeric && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      const fullCode = newDigits.join('');
      if (fullCode.length === 6 && /^\d{6}$/.test(fullCode)) {
        setTimeout(() => {
          submitJoin(fullCode, username);
        }, 60);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || '';
      }
      setDigits(newDigits);

      if (pasted.length === 6) {
        setTimeout(() => {
          submitJoin(pasted, username);
        }, 60);
      } else {
        const nextIndex = Math.min(5, pasted.length);
        inputRefs.current[nextIndex]?.focus();
      }
    }
  };

  const handleCreate = () => {
    unlockAudio();
    setError(null);
    const clean = username.trim();
    if (!USERNAME_RE.test(clean)) {
      setError('Username must be 2–20 letters only.');
      setIsEditingUsername(true);
      return;
    }
    onCreate(clean);
  };

  const handleJoinManual = () => {
    if (!isFullCode) {
      setError('Please enter all 6 digits of the room code.');
      return;
    }
    submitJoin(currentCode, username);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#121214] text-[#F5F5DC] flex flex-col justify-between overflow-hidden select-none px-4 py-6 font-sans">
      {/* Liquid Glass Background Glow Orbs */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-[#40E0D0]/10 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-[#fde5b7]/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-white/[0.02] blur-[150px]" />

      {/* Top Header - Liquid Glass Badge with Logo */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-20">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.09] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.15)]">
          <Logo size={30} withBackground={true} />
          <span className="font-brand font-black text-2xl sm:text-3xl tracking-tight text-[#fde5b7]">
            VYBE
          </span>
        </div>
      </header>

      {/* Main Center Area - Liquid Glass Card */}
      <main className="w-full max-w-[500px] mx-auto z-10 flex flex-col items-center my-auto py-4">
        <div className="w-full relative rounded-[38px] sm:rounded-[44px] p-7 sm:p-11 bg-white/[0.035] backdrop-blur-3xl border border-white/[0.12] shadow-[0_24px_64px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.2)] flex flex-col items-center">
          {/* Subtle Glass Highlight Line */}
          <div className="absolute top-0 left-12 right-12 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

          {/* 6 Digit Input Boxes */}
          <div
            className="flex items-center justify-center gap-2 sm:gap-3.5 mb-7 w-full"
            onPaste={handlePaste}
          >
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={isAutoSubmitting}
                className="w-11 h-14 sm:w-14 sm:h-16 md:w-15 md:h-17 bg-[#fde5b7] text-[#141416] font-brand font-black text-2xl sm:text-3xl md:text-4xl text-center rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#40E0D0]/50 shadow-[0_8px_20px_rgba(0,0,0,0.35),inset_0_2px_4px_rgba(255,255,255,0.4)] transition-all caret-transparent select-none cursor-text disabled:opacity-75"
              />
            ))}
          </div>

          {/* Username Section: "You will join as username ✏️ 🎲" */}
          <div className="flex items-center justify-center mb-8 text-[#fde5b7] text-sm sm:text-base font-medium">
            <span className="opacity-75 mr-2">You will join as</span>
            {isEditingUsername ? (
              <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-xl px-3 py-1 rounded-xl border border-[#40E0D0]/50">
                <input
                  type="text"
                  autoFocus
                  value={tempUsername}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^a-zA-Z]/g, '');
                    setTempUsername(clean);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveUsername()}
                  className="bg-transparent text-[#fde5b7] font-semibold text-sm sm:text-base focus:outline-none w-28 text-center"
                  placeholder="name"
                  maxLength={18}
                />
                <button
                  type="button"
                  onClick={handleSaveUsername}
                  className="p-1 text-[#40E0D0] hover:text-white transition-colors"
                  title="Save Username"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTempUsername(username);
                    setIsEditingUsername(true);
                  }}
                  className="group flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] backdrop-blur-md transition-all cursor-pointer"
                  title="Click to edit username"
                >
                  <span className="font-semibold text-[#fde5b7] group-hover:text-white transition-colors">
                    {username}
                  </span>
                  <Pencil className="w-3.5 h-3.5 text-[#40E0D0] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                </button>

                <button
                  type="button"
                  onClick={handleShuffleUsername}
                  className="p-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#a8a29e] hover:text-[#40E0D0] transition-colors"
                  title="Roll another random name"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Error Feedback */}
          {error && (
            <div className="w-full mb-6 p-3 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200 backdrop-blur-md">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* Action Button */}
          {isFullCode ? (
            <div className="w-full space-y-3 flex flex-col items-center">
              <button
                type="button"
                onClick={handleJoinManual}
                disabled={isAutoSubmitting}
                className="w-full py-4 px-8 rounded-full bg-gradient-to-b from-[#252528] to-[#1c1c1f] hover:from-[#2e2e33] hover:to-[#222226] active:scale-[0.98] text-[#fde5b7] font-bebas text-2xl sm:text-3xl tracking-widest transition-all shadow-[0_12px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)] border border-white/[0.1] flex items-center justify-center gap-2 hover:border-[#40E0D0]/50 disabled:opacity-75"
              >
                {isAutoSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 text-[#40E0D0] animate-spin" />
                    <span>ENTERING ROOM…</span>
                  </>
                ) : (
                  <>
                    <span>JOIN ROOM</span>
                    <ArrowRight className="w-5 h-5 text-[#fde5b7]" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCreate}
                className="text-xs text-[#a8a29e] hover:text-[#fde5b7] underline underline-offset-4 font-medium transition-colors"
              >
                or create a new room instead
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              className="w-full py-4 px-8 rounded-full bg-[#fde5b7] hover:bg-[#ffecc7] active:scale-[0.98] text-[#141416] font-bebas text-2xl sm:text-3xl tracking-widest transition-all shadow-[0_12px_32px_rgba(253,229,183,0.25)] flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-[#141416]" />
              <span>CREATE NEW ROOM</span>
            </button>
          )}
        </div>
      </main>

      {/* Footer from xhertxd.me */}
      <Footer />
    </div>
  );
}
