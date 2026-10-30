import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Headphones,
  Loader2,
  Lock,
  Music2,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import { Brand } from '../components/Brand.js';
import { AuroraBackground } from '../components/AuroraBackground.js';
import { Waveform } from '../components/Waveform.js';
import { cn } from '../lib/cn.js';
import type { RoomPhase } from '../hooks/useRoomSession.js';

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
  const busy = phase === 'connecting';

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      setMode('join');
    }
  }, [initialCode]);

  const submit = (event: FormEvent | { preventDefault: () => void }) => {
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
      setError('The live server is not connected yet. Give it a moment and try again.');
      return;
    }

    if (mode === 'create') onCreate(cleanName);
    else onJoin(code.trim(), cleanName);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AuroraBackground />

      <header className="mx-auto flex w-full max-w-[1380px] items-center justify-between px-5 py-6 sm:px-8 lg:px-12">
        <Brand />
        <div className="flex items-center gap-2">
          <span className="chip hidden sm:inline-flex">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                connected ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'bg-amber-400'
              )}
            />
            {connected ? 'Live server online' : 'Connecting…'}
          </span>
          <span className="chip">
            <Headphones className="h-3 w-3 text-violet-300" />
            v2.0
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1380px] items-center gap-14 px-5 pb-20 pt-6 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:px-12 lg:pt-10">
        {/* ------------------------------------------------------------ hero -- */}
        <section className="animate-rise relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium tracking-[0.18em] text-violet-200">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-300" />
            </span>
            REAL-TIME LISTENING ROOMS
          </div>

          <h1 className="font-display mt-6 text-[clamp(2.9rem,7.2vw,5.4rem)] font-bold leading-[0.94] tracking-[-0.045em]">
            <span className="text-white">One Beat.</span>
            <br />
            <span className="text-gradient">Every Device.</span>
          </h1>

          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-white/55 sm:text-base">
            Create a room, drop a YouTube or Spotify link, and every speaker in the room
            plays the exact same millisecond. No accounts. No downloads. No “you’re three
            seconds behind”.
          </p>

          <div className="mt-8 grid max-w-lg grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5"
              >
                <feature.icon className="h-3.5 w-3.5 flex-none text-violet-300" />
                <span className="text-[11.5px] font-medium text-white/60">{feature.label}</span>
              </div>
            ))}
          </div>

          <NowPlayingPreview />
        </section>

        {/* ------------------------------------------------------------ form -- */}
        <section className="animate-rise relative mx-auto w-full max-w-[480px] lg:mx-0" style={{ animationDelay: '120ms' }}>
          <div className="absolute -inset-[1px] rounded-[30px] bg-gradient-to-b from-white/15 via-white/5 to-transparent opacity-60 blur-[1px]" />
          <div className="panel relative rounded-[28px] p-1.5">
            <div className="rounded-[23px] border border-white/[0.05] bg-[#0a0a11]/70 p-5 sm:p-7">
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.06] bg-black/30 p-1">
                {(
                  [
                    { id: 'create', label: 'Create a room', icon: Sparkles },
                    { id: 'join', label: 'Join a room', icon: ArrowRight },
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
                      'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all',
                      mode === tab.id
                        ? 'bg-white/[0.08] text-white shadow-[0_1px_0_rgba(255,255,255,0.1)_inset]'
                        : 'text-white/45 hover:text-white/75'
                    )}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                {mode === 'join' && (
                  <div>
                    <label
                      htmlFor="room-code"
                      className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40"
                    >
                      Room code
                    </label>
                    <input
                      id="room-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') submit(event);
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      className="field code-field h-16 border-white/15 bg-black/50 text-white placeholder:text-white/15"
                      maxLength={6}
                      aria-live="polite"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40"
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
                    placeholder="e.g. Heman"
                    className="field h-12"
                    maxLength={20}
                    autoFocus={mode === 'create'}
                  />
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/30">
                    <Lock className="h-3 w-3" />
                    2–20 letters. Unique inside the room.
                  </p>
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={busy} className="btn btn-primary h-12 w-full text-[13px]">
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Opening room…
                    </>
                  ) : mode === 'create' ? (
                    <>
                      <Sparkles className="h-4 w-4" />
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

                <p className="text-center text-[11px] leading-relaxed text-white/32">
                  {mode === 'create'
                    ? 'You become the admin — control playback, queue, and settings.'
                    : 'Joining a code that does not exist creates it instantly.'}
                </p>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.07]" />
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/25">
                  No sign-up
                </span>
                <div className="h-px flex-1 bg-white/[0.07]" />
              </div>

              <div className="flex items-center justify-center gap-4 text-[11px] text-white/32">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300/80" />
                  Admin-gated
                </span>
                <span className="h-3 w-px bg-white/10" />
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-300/80" />
                  ~40ms drift
                </span>
                <span className="h-3 w-px bg-white/10" />
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-cyan-300/80" />
                  Up to 50
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-white/25">
            <span className="h-1 w-1 rounded-full bg-white/25" />
            Works with any speaker, browser, or phone in the room
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1380px] flex-col items-center justify-between gap-3 border-t border-white/[0.05] px-5 py-6 text-[11px] text-white/25 sm:flex-row sm:px-8 lg:px-12">
        <p>One beat. Every device. Built for listening together.</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Server-authoritative playback</p>
      </footer>
    </div>
  );
}

function NowPlayingPreview() {
  return (
    <div className="relative mt-12 hidden max-w-lg sm:block">
      <div className="absolute -left-6 top-6 h-40 w-40 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="glass relative flex items-center gap-4 rounded-2xl p-3.5 pr-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,1)]">
        <div className="relative h-16 w-16 flex-none overflow-hidden rounded-xl">
          <img
            src="https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80"
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              ● Now playing
            </span>
            <span className="text-[9px] uppercase tracking-[0.14em] text-white/25">Room 824193</span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-white">Midnight Drive</p>
          <p className="truncate text-[11px] text-white/40">Nova Waves · YouTube</p>
        </div>
        <div className="hidden w-28 flex-none sm:block">
          <Waveform playing bars={24} className="h-8" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between px-1">
        <div className="flex -space-x-2">
          {['#8b5cf6', '#22d3ee', '#ec4899', '#34d399'].map((color, index) => (
            <div
              key={color}
              className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#06060a] text-[9px] font-bold text-white"
              style={{ background: `linear-gradient(140deg, ${color}, ${color}88)` }}
            >
              {['H', 'M', 'A', 'J'][index]}
            </div>
          ))}
          <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#06060a] bg-white/10 text-[9px] font-semibold text-white/70">
            +3
          </div>
        </div>
        <span className="chip">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          7 devices in sync
        </span>
      </div>
    </div>
  );
}
