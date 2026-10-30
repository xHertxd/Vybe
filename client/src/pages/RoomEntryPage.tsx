import { useEffect, useRef, useState } from 'react';
import {
  Pencil,
  Check,
  AlertCircle,
  ArrowRight,
  Server,
  RefreshCw,
  X,
  Shuffle,
} from 'lucide-react';
import { Footer } from '../components/Footer.js';
import type { RoomPhase } from '../hooks/useRoomSession.js';
import {
  getConnectionInfo,
  subscribeConnectionInfo,
  setCustomServerUrl,
  resetServerUrl,
  type ConnectionInfo,
} from '../services/socket.js';

interface RoomEntryPageProps {
  onCreate: (username: string) => void;
  onJoin: (roomCode: string, username: string) => void;
  phase: RoomPhase;
  connected: boolean;
  initialUsername: string;
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

export function RoomEntryPage({
  onCreate,
  onJoin,
  phase,
  connected,
  initialUsername,
  initialCode,
}: RoomEntryPageProps) {
  // Automatically generate random alphabetic name on load if not set
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

  // Live connection state
  const [connInfo, setConnInfo] = useState<ConnectionInfo>(() => getConnectionInfo());
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(connInfo.url);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const busy = phase === 'connecting';

  useEffect(() => {
    return subscribeConnectionInfo((info) => {
      setConnInfo(info);
      setServerUrlInput(info.url);
    });
  }, []);

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

  const handleSaveServerUrl = () => {
    const clean = serverUrlInput.trim();
    if (!clean) return;
    setCustomServerUrl(clean);
    setShowServerModal(false);
  };

  const handleResetServerUrl = () => {
    resetServerUrl();
    setShowServerModal(false);
  };

  const isConnected = connected || connInfo.status === 'connected';

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-[#171719] overflow-hidden text-[#fde5b7]">
      {/* Top Header Banner matching exact user design */}
      <div className="w-full flex items-start justify-between z-10">
        <div className="bg-[#fde5b7] text-black px-10 sm:px-14 py-4 sm:py-5 rounded-br-[40px] sm:rounded-br-[56px] flex items-center shadow-lg">
          <span className="font-brand font-black text-4xl sm:text-5xl md:text-6xl tracking-tighter select-none">
            VYBE
          </span>
        </div>

        {/* Live Server Status Pill */}
        <div className="p-4 sm:p-7 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowServerModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#262629] border border-white/10 hover:border-[#fde5b7]/40 transition-all text-xs font-mono group"
            title="Click to view or edit server connection"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-[#86efac]'
                  : connInfo.status === 'error'
                  ? 'bg-[#f87171]'
                  : 'bg-[#fbbf24] animate-pulse'
              }`}
            />
            <span className="text-[#a8a29e] group-hover:text-[#fde5b7] transition-colors">
              {isConnected
                ? 'Live'
                : connInfo.status === 'error'
                ? `Offline (${connInfo.host})`
                : `Connecting to ${connInfo.host}...`}
            </span>
          </button>
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
                className="w-11 h-14 sm:w-14 sm:h-16 md:w-16 md:h-18 bg-[#fde5b7] text-black font-brand font-black text-2xl sm:text-3xl md:text-4xl text-center rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#fde5b7]/50 shadow-md transition-all caret-transparent select-none cursor-text"
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
              <div className="flex items-center gap-2">
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
                <button
                  type="button"
                  onClick={handleShuffleUsername}
                  className="p-1 text-[#a8a29e] hover:text-[#fde5b7] transition-colors"
                  title="Generate another random name"
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
                onClick={handleJoin}
                disabled={busy}
                className="w-full max-w-xs py-3.5 px-8 rounded-full bg-[#1c1c1f] hover:bg-[#232327] active:scale-95 text-[#fde5b7] font-bebas text-2xl tracking-widest transition-all shadow-xl border border-white/5 flex items-center justify-center gap-2 hover:border-[#fde5b7]/30 disabled:opacity-50"
              >
                <span>{busy ? 'CONNECTING...' : 'JOIN ROOM'}</span>
                {!busy && <ArrowRight className="w-5 h-5 text-[#fde5b7]" />}
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
              className="w-full max-w-xs py-3.5 px-8 rounded-full bg-[#1c1c1f] hover:bg-[#232327] active:scale-95 text-[#fde5b7] font-bebas text-2xl tracking-widest transition-all shadow-xl border border-white/5 flex items-center justify-center gap-2 hover:border-[#fde5b7]/30 disabled:opacity-50"
            >
              <span>{busy ? 'CONNECTING...' : 'CREATE NEW ROOM'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <Footer />

      {/* Server Configuration Modal */}
      {showServerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#262629] border border-white/10 rounded-3xl p-6 shadow-2xl text-[#fde5b7] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <Server className="w-5 h-5 text-[#fde5b7]" />
                <h3 className="font-brand font-bold text-lg text-white">Live Server Status</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="p-1 rounded-lg text-[#a8a29e] hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#171719] border border-white/5">
                <span className="text-[#a8a29e]">Connection State:</span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConnected
                        ? 'bg-[#86efac]'
                        : connInfo.status === 'error'
                        ? 'bg-[#f87171]'
                        : 'bg-[#fbbf24] animate-pulse'
                    }`}
                  />
                  {isConnected
                    ? 'Connected (Live)'
                    : connInfo.status === 'error'
                    ? 'Offline'
                    : 'Connecting...'}
                </span>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#a8a29e] font-semibold mb-1.5">
                  Vybe Backend Server URL
                </label>
                <input
                  type="text"
                  value={serverUrlInput}
                  onChange={(e) => setServerUrlInput(e.target.value)}
                  placeholder="http://localhost:5000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#171719] border border-white/10 focus:border-[#fde5b7] text-white font-mono text-xs focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[#a8a29e]">
                  Locally running server defaults to{' '}
                  <span className="font-mono text-[#fde5b7]">http://localhost:5000</span>.
                </p>
              </div>

              {connInfo.lastError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-[11px] leading-relaxed">
                  <strong>Notice:</strong> {connInfo.lastError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleResetServerUrl}
                className="px-3.5 py-2 rounded-xl border border-white/10 text-xs text-[#a8a29e] hover:text-white hover:bg-white/5 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset to Local</span>
              </button>
              <button
                type="button"
                onClick={handleSaveServerUrl}
                className="px-4 py-2 rounded-xl bg-[#fde5b7] text-black font-semibold text-xs hover:bg-[#fee8c8] active:scale-95 transition-all"
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
