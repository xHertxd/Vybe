import { useEffect, useRef, useState } from 'react';
import { Pencil, Check, AlertCircle, ArrowRight, Shuffle, Loader2 } from 'lucide-react';
import { Footer } from '../components/Footer.js';

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
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    if (ctx.state === 'suspended') void ctx.resume();
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
  // Automatically generate random alphabetic name on initial load
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

  // Directly enter the room or create it if it doesn't exist
  const submitJoin = (code: string, user: string) => {
    unlockAudio();
    setIsAutoSubmitting(true);
    onJoin(code, user);
  };

  // If initialCode was supplied in direct URL link, directly enter the room!
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

      // If all 6 digits entered: DIRECTLY make user enter the room (or create if not exist)!
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

      // If all 6 digits pasted: DIRECTLY make user enter the room!
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
    <div className="relative min-h-screen w-full bg-[#171719] text-[#fde5b7] flex flex-col items-center justify-between overflow-hidden select-none px-4 py-6">
      {/* Top Left Minimalist Brand Badge */}
      <header className="w-full max-w-6xl flex items-center justify-between z-20">
        <div className="bg-[#fde5b7] text-black px-8 sm:px-12 py-3 sm:py-4 rounded-2xl sm:rounded-3xl flex items-center shadow-md">
          <span className="font-brand font-black text-3xl sm:text-4xl tracking-tight select-none">
            VYBE
          </span>
        </div>
      </header>

      {/* Main Center Area */}
      <main className="w-full max-w-[480px] z-10 flex flex-col items-center my-auto">
        <div className="w-full bg-[#242427] rounded-[36px] sm:rounded-[40px] p-7 sm:p-11 shadow-2xl flex flex-col items-center border border-white/[0.08]">
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
                className="w-11 h-14 sm:w-14 sm:h-16 md:w-15 md:h-17 bg-[#fde5b7] text-black font-brand font-black text-2xl sm:text-3xl md:text-4xl text-center rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#fde5b7]/50 shadow-md transition-all caret-transparent select-none cursor-text disabled:opacity-75"
              />
            ))}
          </div>

          {/* Username Section: "You will join as username ✏️ 🎲" */}
          <div className="flex items-center justify-center mb-8 text-[#fde5b7] text-sm sm:text-base font-medium">
            <span className="opacity-80 mr-1.5">You will join as</span>
            {isEditingUsername ? (
              <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-xl border border-[#fde5b7]/40">
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
                  className="p-1 hover:text-white transition-colors"
                  title="Save Username"
                >
                  <Check className="w-4 h-4 text-[#fde5b7]" />
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
                  className="group flex items-center gap-1.5 cursor-pointer"
                  title="Click to edit username"
                >
                  <span className="underline decoration-[#fde5b7]/60 underline-offset-4 font-semibold text-[#fde5b7] group-hover:text-white transition-colors">
                    {username}
                  </span>
                  <Pencil className="w-3.5 h-3.5 text-[#fde5b7] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                </button>

                <button
                  type="button"
                  onClick={handleShuffleUsername}
                  className="p-1 text-[#a8a29e] hover:text-[#fde5b7] transition-colors"
                  title="Roll another random name"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Error Feedback */}
          {error && (
            <div className="w-full mb-6 p-3 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
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
                className="w-full py-4 px-8 rounded-full bg-[#1c1c1f] hover:bg-[#252528] active:scale-[0.98] text-[#fde5b7] font-bebas text-2xl sm:text-3xl tracking-widest transition-all shadow-xl border border-white/5 flex items-center justify-center gap-2 hover:border-[#fde5b7]/30 disabled:opacity-75"
              >
                {isAutoSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 text-[#fde5b7] animate-spin" />
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
              className="w-full py-4 px-8 rounded-full bg-[#1c1c1f] hover:bg-[#252528] active:scale-[0.98] text-[#fde5b7] font-bebas text-2xl sm:text-3xl tracking-widest transition-all shadow-xl border border-white/5 flex items-center justify-center gap-2 hover:border-[#fde5b7]/30"
            >
              <span>CREATE NEW ROOM</span>
            </button>
          )}
        </div>
      </main>

      {/* Footer promoting Hertx */}
      <footer className="w-full z-10 text-center">
        <Footer />
      </footer>
    </div>
  );
}
