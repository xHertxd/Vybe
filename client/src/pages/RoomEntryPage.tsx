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

// Word pairs for generating unique usernames
const ADJECTIVES = [
  'Midnight', 'Solar', 'Lunar', 'Cosmic', 'Neon', 'Electric', 'Velvet', 'Silent',
  'Wild', 'Calm', 'Bold', 'Swift', 'Deep', 'High', 'Low', 'Fast',
  'Slow', 'Bright', 'Dark', 'Cool', 'Warm', 'Fresh', 'Raw', 'Pure',
  'Magic', 'Epic', 'Vibe', 'Flow', 'Wave', 'Beat', 'Pulse', 'Rhythm',
  'Soul', 'Mind', 'Dream', 'Hope', 'Joy', 'Peace', 'Zen', 'Aura',
  'Nova', 'Star', 'Moon', 'Sky', 'Sea', 'Fire', 'Ice', 'Wind',
  'Storm', 'Rain', 'Snow', 'Dawn', 'Dusk', 'Twilight', 'Shadow', 'Light',
];

const NOUNS = [
  'Echo', 'Pulse', 'Wave', 'Beat', 'Flow', 'Vibe', 'Rhythm', 'Soul',
  'Dream', 'Spark', 'Flare', 'Ray', 'Nova', 'Star', 'Moon', 'Sky',
  'Drift', 'Shift', 'Glide', 'Slide', 'Ride', 'Tide', 'Guide', 'Slide',
  'Force', 'Power', 'Energy', 'Motion', 'Action', 'Reaction', 'Vision', 'Mission',
  'Journey', 'Quest', 'Path', 'Way', 'Road', 'Track', 'Trail', 'Rail',
  'Sound', 'Tone', 'Note', 'Chord', 'Harmony', 'Melody', 'Song', 'Tune',
  'Bass', 'Treble', 'Drop', 'Lift', 'Rise', 'Fall', 'Peak', 'Valley',
  'Horizon', 'Summit', 'Crest', 'Edge', 'Border', 'Limit', 'Beyond', 'Infinite',
];

function generateUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}

const USERNAME_RE = /^[A-Za-z]{2,20}$/;

function unlockAudio(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
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
  const [username, setUsername] = useState<string>(() =>
    initialUsername && USERNAME_RE.test(initialUsername) ? initialUsername : generateUsername()
  );

  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState(username);
  const [digits, setDigits] = useState<string[]>(() =>
    initialCode && /^\d{6}$/.test(initialCode) ? initialCode.split('') : ['', '', '', '', '', '']
  );
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
      const timer = setTimeout(() => submitJoin(initialCode, username), 180);
      return () => clearTimeout(timer);
    }
  }, [initialCode, username]);

  const handleSaveUsername = () => {
    const clean = tempUsername.trim();
    if (!USERNAME_RE.test(clean)) { setError('Username must be 2–20 letters only (A–Z).'); return; }
    setUsername(clean);
    setIsEditingUsername(false);
    setError(null);
  };

  const handleShuffleUsername = () => {
    let next = generateUsername();
    while (next === username) next = generateUsername();
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
      if (numeric && index < 5) inputRefs.current[index + 1]?.focus();
      const fullCode = newDigits.join('');
      if (fullCode.length === 6 && /^\d{6}$/.test(fullCode)) {
        setTimeout(() => submitJoin(fullCode, username), 60);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    else if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    else if (e.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = digits.map((_, i) => pasted[i] || '');
      setDigits(newDigits);
      if (pasted.length === 6) setTimeout(() => submitJoin(pasted, username), 60);
      else inputRefs.current[Math.min(5, pasted.length)]?.focus();
    }
  };

  const handleCreate = () => {
    unlockAudio();
    setError(null);
    const clean = username.trim();
    if (!USERNAME_RE.test(clean)) { setError('Username must be 2–20 letters only.'); setIsEditingUsername(true); return; }
    onCreate(clean);
  };

  const handleJoinManual = () => {
    if (!isFullCode) { setError('Please enter all 6 digits of the room code.'); return; }
    submitJoin(currentCode, username);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden px-4 py-10">
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-10 mb-10">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] backdrop-blur border border-white/5">
          <Logo size={32} withBackground={true} />
          <span className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-white">Vybe</span>
        </div>
      </header>

      <main className="w-full max-w-[440px] mx-auto flex-1 flex flex-col items-center my-auto">
        <div className="w-full surface rounded-2xl p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl font-bold text-white tracking-tight">Enter Room</h1>
            <p className="mt-2 text-sm text-[#737373]">6-digit code to join a session</p>
          </div>

          {/* Code Input */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-8 w-full" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={isAutoSubmitting}
                className="w-12 h-16 sm:w-14 sm:h-18 md:w-15 md:h-20 bg-white/[0.03] text-white font-display font-bold text-2xl sm:text-3xl md:text-4xl text-center rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20 transition-all caret-transparent select-none cursor-text disabled:opacity-50 border border-white/5"
              />
            ))}
          </div>

          {/* Username */}
          <div className="mb-8">
            <label className="block text-xs font-medium text-[#737373] mb-2">Your Name</label>
            {isEditingUsername ? (
              <div className="flex items-center gap-2">
                <input
                  type="text" autoFocus value={tempUsername}
                  onChange={(e) => { setTempUsername(e.target.value.replace(/[^a-zA-Z]/g, '')); setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveUsername()}
                  className="flex-1 input text-center text-lg font-semibold"
                  placeholder="name" maxLength={18}
                />
                <button type="button" onClick={handleSaveUsername} className="icon-btn bg-white text-black hover:bg-[#f3f4f6]" title="Save">
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  type="button" onClick={() => { setTempUsername(username); setIsEditingUsername(true); }}
                  className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-all cursor-pointer w-full text-left"
                  title="Click to edit username"
                >
                  <span className="font-semibold text-white group-hover:text-[#e5e7eb] transition-colors">{username}</span>
                  <Pencil className="w-4 h-4 text-[#737373] group-hover:text-white transition-all" />
                </button>
                <button type="button" onClick={handleShuffleUsername}
                  className="icon-btn bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 text-[#737373] hover:text-white transition-colors"
                  title="Generate new name">
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="w-full mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-xs text-red-200 animate-slide-up">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {isFullCode ? (
            <div className="w-full space-y-3 flex flex-col items-center">
              <button type="button" onClick={handleJoinManual} disabled={isAutoSubmitting}
                className="w-full py-3.5 px-8 rounded-full bg-gradient-to-b from-[#1a1a1a] to-[#111111] hover:from-[#222222] hover:to-[#161616] active:scale-[0.98] text-white font-display text-xl sm:text-2xl tracking-widest transition-all border border-white/5 flex items-center justify-center gap-2 disabled:opacity-50">
                {isAutoSubmitting ? (
                  <> <Loader2 className="w-5 h-5 text-white animate-spin" /> <span>ENTERING…</span> </>
                ) : (
                  <> <span>JOIN ROOM</span> <ArrowRight className="w-5 h-5 text-white" /> </>
                )}
              </button>
              <button type="button" onClick={handleCreate}
                className="text-xs text-[#737373] hover:text-white underline underline-offset-4 font-medium transition-colors">
                or create a new room instead
              </button>
            </div>
          ) : (
            <button type="button" onClick={handleCreate}
              className="w-full py-3.5 px-8 rounded-full bg-white text-black font-display text-xl sm:text-2xl tracking-widest transition-all hover:bg-[#f3f4f6] active:scale-[0.98] flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5" />
              <span>CREATE ROOM</span>
            </button>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}