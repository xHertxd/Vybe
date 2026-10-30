import { useEffect, useRef, useState } from 'react';
import { Pencil, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { Footer } from '../components/Footer.js';
import type { RoomPhase } from '../hooks/useRoomSession.js';

interface RoomEntryPageProps {
  onCreate: (username: string) => void;
  onJoin: (roomCode: string, username: string) => void;
  phase: RoomPhase;
  connected: boolean;
  initialUsername: string;
  initialCode?: string;
}

const RANDOM_NAMES = [
  'Echo',
  'Nova',
  'Zephyr',
  'Solaris',
  'Aura',
  'Vesper',
  'Zenith',
  'Cosmo',
  'Lyric',
  'Rhythm',
  'Drift',
  'Pulse',
  'Sonic',
  'Astral',
  'Mirage',
  'Apex',
  'Orbit',
  'Helix',
  'Haven',
  'Blaze',
  'Siren',
  'Phantom',
  'Kismet',
  'Solstice',
  'Vibe',
  'Nexus',
  'Echoes',
  'Prism',
  'Flux',
  'Vortex',
];

function generateRandomUsername(): string {
  const idx = Math.floor(Math.random() * RANDOM_NAMES.length);
  return RANDOM_NAMES[idx];
}

const USERNAME_RE = /^[A-Za-z]{2,20}$/;

export function RoomEntryPage({
  onCreate,
  onJoin,
  phase,
  connected,
  initialUsername,
  initialCode,
}: RoomEntryPageProps) {
  // Generate random name automatically if not saved
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

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const busy = phase === 'connecting';

  useEffect(() => {
    if (initialCode && /^\d{6}$/.test(initialCode)) {
      setDigits(initialCode.split(''));
    }
  }, [initialCode]);

  const handleSaveUsername = () => {
    const clean = tempUsername.trim();
    if (!USERNAME_RE.test(clean)) {
      setError('Username must be 2–20 alphabetic letters only (A–Z, a–z).');
      return;
    }
    setUsername(clean);
    setIsEditingUsername(false);
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
      const nextIndex = Math.min(5, pasted.length);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const currentCode = digits.join('');
  const isFullCode = currentCode.length === 6;

  const handleCreate = () => {
    setError(null);
    const clean = username.trim();
    if (!USERNAME_RE.test(clean)) {
      setError('Username must be 2–20 letters only.');
      setIsEditingUsername(true);
      return;
    }
    onCreate(clean);
  };

  const handleJoin = () => {
    setError(null);
    const clean = username.trim();
    if (!USERNAME_RE.test(clean)) {
      setError('Username must be 2–20 letters only.');
      setIsEditingUsername(true);
      return;
    }
    if (!isFullCode) {
      setError('Please enter all 6 digits of the room code.');
      return;
    }
    onJoin(currentCode, clean);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-[#171719] overflow-hidden text-[#fde5b7]">
      {/* Top Header Banner matching exact user design */}
      <div className="w-full flex items-start justify-between z-10">
        <div className="bg-[#fde5b7] text-black px-10 sm:px-14 py-4 sm:py-5 rounded-br-[40px] sm:rounded-br-[56px] flex items-center shadow-lg">
          <span className="font-brand text-4xl sm:text-5xl md:text-6xl tracking-tighter select-none">
            VYBE
          </span>
        </div>

        {/* Minimal live connection status */}
        <div className="p-5 sm:p-7 flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-[#86efac]' : 'bg-[#f87171] animate-pulse'
            }`}
          />
          <span className="text-xs font-mono text-[#a8a29e]">
            {connected ? 'Live' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Main Center Container */}
      <div className="my-auto w-full max-w-lg sm:max-w-xl px-4 py-8 z-10 flex flex-col items-center">
        {/* The Card from user design */}
        <div className="w-full bg-[#262629] rounded-[36px] sm:rounded-[44px] p-8 sm:p-12 shadow-2xl flex flex-col items-center border border-white/5">
          {/* 6 Digit Input Boxes */}
          <div
            className="flex items-center justify-center gap-2.5 sm:gap-3.5 mb-8 w-full max-w-md"
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
                className="w-11 h-14 sm:w-14 sm:h-16 md:w-16 md:h-18 bg-[#fde5b7] text-black font-brand text-2xl sm:text-3xl md:text-4xl text-center rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#fde5b7]/50 shadow-md transition-all caret-transparent select-none cursor-text"
              />
            ))}
          </div>

          {/* Username Section: "You will join as username ✏️" */}
          <div className="flex items-center justify-center mb-8 text-[#fde5b7] text-sm sm:text-base font-medium">
            <span className="opacity-80 mr-1.5">You will join as</span>
            {isEditingUsername ? (
              <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-lg border border-[#fde5b7]/40">
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
              <div
                onClick={() => {
                  setTempUsername(username);
                  setIsEditingUsername(true);
                }}
                className="group flex items-center gap-1.5 cursor-pointer"
                title="Click to edit username"
              >
                <span className="underline decoration-[#fde5b7]/50 underline-offset-4 font-semibold text-[#fde5b7] group-hover:text-white transition-colors">
                  {username}
                </span>
                <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#fde5b7] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
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
                onClick={handleJoin}
                disabled={busy}
                className="w-full max-w-xs py-3.5 px-8 rounded-full bg-[#1c1c1f] hover:bg-[#232327] active:scale-95 text-[#fde5b7] font-bebas text-2xl tracking-widest transition-all shadow-xl border border-white/5 flex items-center justify-center gap-2 hover:border-[#fde5b7]/30"
              >
                <span>JOIN ROOM</span>
                <ArrowRight className="w-5 h-5 text-[#fde5b7]" />
              </button>

              <button
                type="button"
                onClick={handleCreate}
                disabled={busy}
                className="text-xs text-[#a8a29e] hover:text-[#fde5b7] underline underline-offset-4 font-medium transition-colors"
              >
                or create a new room instead
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="w-full max-w-xs py-3.5 px-8 rounded-full bg-[#1c1c1f] hover:bg-[#232327] active:scale-95 text-[#fde5b7] font-bebas text-2xl tracking-widest transition-all shadow-xl border border-white/5 flex items-center justify-center gap-2 hover:border-[#fde5b7]/30"
            >
              <span>CREATE NEW ROOM</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
