import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Headphones,
  Loader2,
  Lock,
  Music2,
  Radio,
  ShieldCheck,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import { Brand } from '../components/Brand.js';
import { AuroraBackground } from '../components/AuroraBackground.js';
import { Footer } from '../components/Footer.js';
import { cn } from '../lib/cn.js';
import type { RoomPhase } from '../hooks/useRoomSession.js';
import { waitForConnection } from '../services/socket.js';

interface RoomEntryPageProps {
  onCreate: (username: string) => void;
  onJoin: (roomCode: string, username: string) => void;
  phase: RoomPhase;
  connected: boolean;
  initialUsername: string;
  initialCode?: string;
}

type Mode = 'create' | 'join';

const USERNAME_RE = /^[A-Za-z]{2,20}$/;
const CODE_RE = /^\d{6}$/;

export function RoomEntryPage({
  onCreate,
  onJoin,
  phase,
  connected,
  initialUsername,
  initialCode,
}: RoomEntryPageProps) {
  const [mode, setMode] = useState<Mode>(initialCode ? 'join' : 'create');
  const [username, setUsername] = useState(initialUsername);
  const [code, setCode] = useState(initialCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [waitingForServer, setWaitingForServer] = useState(false);
  const busy = phase === 'connecting' || waitingForServer;

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      setMode('join');
    }
  }, [initialCode]);

  const submit = async (event: FormEvent | { preventDefault: () => void }) => {
    event.preventDefault();
    setError(null);

    const cleanName = username.trim();
    if (!USERNAME_RE.test(cleanName)) {
      setError('Usernames must be 2–20 letters, letters only.');
      return;
    }
    if (mode === 'join' && !CODE_RE.test(code.trim())) {
      setError('Enter the 6-digit room code.');
      return;
    }

    if (!connected) {
      setWaitingForServer(true);
      const online = await waitForConnection(9_000);
      setWaitingForServer(false);
      if (!online) {
        setError(
          'Cannot reach the live server. Check that the backend is running and try again.'
        );
        return;
      }
    }

    if (mode === 'create') onCreate(cleanName);
    else onJoin(code.trim(), cleanName);
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <AuroraBackground />

      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-7 sm:px-8 lg:px-10">
        <Brand showByline />
        <span className="chip">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              connected ? 'bg-forest' : 'bg-rust animate-pulse-soft'
            )}
          />
          {connected ? 'Live' : 'Connecting'}
        </span>
      </header>

      <main className="mx-auto grid w-full max-w-[1280px] flex-1 items-center gap-14 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:px-10 lg:pt-6">
        {/* ------------------------------------------------------------ hero -- */}
        <section className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-sand bg-cream px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-taupe">
            <Headphones className="h-3 w-3" />
            Real-time listening rooms
          </div>

          <h1 className="font-display mt-7 text-[clamp(2.8rem,6.4vw,5.2rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-ink">
            One Beat.
            <br />
            <span className="italic text-slate">Every Device.</span>
          </h1>

          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-slate sm:text-base">
            Create a room, share the code, and play YouTube, Spotify or your own audio on every
            speaker at once. One person controls the session; everyone hears the same moment.
          </p>

          <div className="mt-9 grid max-w-lg grid-cols-2 gap-2.5 sm:grid-cols-3">
            {[
              { icon: Radio, label: 'Server-timed sync' },
              { icon: Video, label: 'YouTube + Shorts' },
              { icon: Music2, label: 'Spotify links' },
              { icon: Users, label: 'Live presence' },
              { icon: Zap, label: 'Instant rooms' },
              { icon: ShieldCheck, label: 'Admin controls' },
            ].map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-2 rounded-xl border border-sand/90 bg-cream px-3 py-2.5"
              >
                <feature.icon className="h-3.5 w-3.5 flex-none text-taupe" />
                <span className="text-[11.5px] text-slate">{feature.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 hidden max-w-lg border-t border-sand pt-6 sm:block">
            <p className="text-[11px] leading-relaxed text-taupe">
              No accounts. No downloads. A private room lives at one six-digit code — playback is
              scheduled and corrected continuously so nobody drifts behind.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------ form -- */}
        <section
          className="animate-rise mx-auto w-full max-w-[460px] lg:mx-0"
          style={{ animationDelay: '100ms' }}
        >
          <div className="panel rounded-[24px] p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
                {mode === 'create' ? 'Start a room' : 'Join a room'}
              </h2>
              <span className="text-[10px] uppercase tracking-[0.18em] text-taupe">
                {mode === 'create' ? 'Admin' : 'Listener'}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-sand bg-paper p-1">
              {(
                [
                  { id: 'create', label: 'Create' },
                  { id: 'join', label: 'Join' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setMode(tab.id);
                    setError(null);
                  }}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                    mode === tab.id
                      ? 'bg-cream text-ink shadow-[0_1px_2px_rgba(35,32,28,0.08)]'
                      : 'text-taupe hover:text-graphite'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === 'join' && (
                <div>
                  <label
                    htmlFor="room-code"
                    className="mb-2 block text-[10px] font-medium uppercase tracking-[0.18em] text-taupe"
                  >
                    Room code
                  </label>
                  <input
                    id="room-code"
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                      setError(null);
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="field code-field h-16"
                    maxLength={6}
                    aria-live="polite"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-[10px] font-medium uppercase tracking-[0.18em] text-taupe"
                >
                  Your name
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 20));
                    setError(null);
                  }}
                  autoComplete="nickname"
                  placeholder="Letters only"
                  className="field h-12"
                  maxLength={20}
                  autoFocus={mode === 'create'}
                />
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-taupe">
                  <Lock className="h-3 w-3" />
                  2–20 letters. Unique inside the room.
                </p>
              </div>

              {error && (
                <div className="rounded-xl border border-rust/25 bg-rust/5 px-3.5 py-2.5 text-xs leading-relaxed text-rust">
                  {error}
                </div>
              )}

              <button type="submit" disabled={busy} className="btn btn-primary h-12 w-full text-[13px]">
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {waitingForServer ? 'Connecting to server…' : 'Opening room…'}
                  </>
                ) : mode === 'create' ? (
                  <>
                    Create room
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Join the room
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <p className="text-center text-[11px] leading-relaxed text-taupe">
                {mode === 'create'
                  ? 'You become the admin — playback, queue and settings are yours.'
                  : 'A code that does not exist yet is created instantly.'}
              </p>
            </form>

            <div className="mt-6 flex items-center justify-center gap-4 border-t border-sand pt-5 text-[10.5px] text-taupe">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin-gated
              </span>
              <span className="h-3 w-px bg-sand" />
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Auto re-sync
              </span>
              <span className="h-3 w-px bg-sand" />
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Up to 50
              </span>
            </div>
          </div>

          <a
            href="https://github.com/xHertxd"
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-taupe transition-colors hover:text-graphite"
          >
            Built and maintained by Hertx
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
}
