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
  'Nova', 'Zephyr', 'Solaris', 'Aura', 'Vesper', 'Zenith', 'Cosmo', 'Lyric',
  'Rhythm', 'Pulse', 'Astral', 'Blaze', 'Echo', 'Mirage', 'Apex', 'Haven',
  'Helix', 'Orbit', 'Solstice', 'Vortex', 'Prism', 'Flux', 'Nexus', 'Siren',
  'Phantom', 'Kismet', 'Drift', 'Sonic',
];

function generateRandomUsername(): string {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
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
    const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
    silent.volume = 0.01;
    void silent.play().catch(() => {});
  } catch {}
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
    if (initialCode && /^\d{6}$/.test(initialCode) && !autoJoinTriggered.current) {
      autoJoinTriggered.current = true;
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
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden px-4 py-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(253,229,183,0.03),transparent_70%)]" />

      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-10 mb-8">
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/3 backdrop-blur border border-white/5">
          <Logo size={32} withBackground={true} />
          <span className="font-brand font-black text-2xl sm:text-3xl tracking-tight text-[#fde5b7]">
            VYBE
          </span>
        </div>
      </header>

      <main className="w-full max-w-[460px] mx-auto flex-1 flex flex-col items-center my-auto">
        <div className="w-full surface rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-center gap-2 sm:gap-3.5 mb-8 w-full" onPaste={handlePaste}>
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
                className="w-11 h-14 sm:w-14 sm:h-16 md:w-15 md:h-17 bg-[#fde5b7] text-[#141416] font-brand font-black text-2xl sm:text-3xl md:text-4xl text-center rounded-xl focus:outline-none focus:ring-3 focus:ring-[#fde5b7]/40 transition-all caret-transparent select-none cursor-text disabled:opacity-75"
              />
            ))}
          </div>

          <div className="flex items-center justify-center mb-8 text-[#fde5b7] text-sm sm:text-base font-medium">
            <span className="opacity-60 mr-2">You will join as</span>
            {isEditingUsername ? (
              <div className="flex items-center gap-1.5 surface px-3 py-1.5 rounded-xl border border-[#fde5b7]/20">
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
                  className="group flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/3 hover:bg-white/5 border border-white/5 backdrop-blur transition-all cursor-pointer"
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
                  className="p-1.5 rounded-full bg-white/3 hover:bg-white/5 border border-white/5 text-[#a8a29e] hover:text-[#40E0D0] transition-colors"
                  title="Roll another random name"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="w-full mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {isFullCode ? (
            <div className="w-full space-y-3 flex flex-col items-center">
              <button
                type="button"
                onClick={handleJoinManual}
                disabled={isAutoSubmitting}
                className="w-full py-3.5 px-8 rounded-full bg-gradient-to-b from-[#252528] to-[#1c1c1f] hover:from-[#2e2e33] hover:to-[#222226] active:scale-[0.98] text-[#fde5b7] font-bebas text-2xl sm:text-3xl tracking-widest transition-all shadow-[0_8px_24px_rgba(0,0,0,0.4)] border border-white/5 flex items-center justify-center gap-2 hover:border-[#40E0D0]/30 disabled:opacity-60"
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
              className="w-full py-3.5 px-8 rounded-full bg-[#fde5b7] hover:bg-[#fee8c8] active:scale-[0.98] text-[#141416] font-bebas text-2xl sm:text-3xl tracking-widest transition-all shadow-[0_8px_24px_rgba(253,229,183,0.2)] flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-[#141416]" />
              <span>CREATE NEW ROOM</span>
            </button>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}