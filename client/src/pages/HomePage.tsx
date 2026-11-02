import React, { useState, useEffect } from 'react';
import { Radio, ArrowRight, Sparkles, Users, Music2, ShieldCheck } from 'lucide-react';

interface HomePageProps {
  onCreateRoom: (username: string) => void;
  onJoinRoom: (roomCode: string, username: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onCreateRoom, onJoinRoom }) => {
  const [username, setUsername] = useState(
    () => localStorage.getItem('vybe_username') || `Guest_${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [joinCode, setJoinCode] = useState('');
  const [isAutoEntering, setIsAutoEntering] = useState(false);

  // Check URL query params for ?room=123456
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const code = roomParam.trim().replace(/\D/g, '').slice(0, 6);
      if (code.length === 6) {
        setJoinCode(code);
        setIsAutoEntering(true);
        const name = username.trim() || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
        localStorage.setItem('vybe_username', name);
        onJoinRoom(code, name);
      } else {
        setJoinCode(code);
      }
    }
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    localStorage.setItem('vybe_username', username.trim());
    onCreateRoom(username.trim());
  };

  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = joinCode.trim();
    if (!username.trim() || cleanCode.length < 6) return;
    localStorage.setItem('vybe_username', username.trim());
    setIsAutoEntering(true);
    onJoinRoom(cleanCode, username.trim());
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setJoinCode(cleaned);

    // Auto-enter immediately as soon as 6 digits are entered without waiting for button click!
    if (cleaned.length === 6) {
      const activeName = username.trim() || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem('vybe_username', activeName);
      setIsAutoEntering(true);
      onJoinRoom(cleaned, activeName);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12">
      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1.5 text-xs font-mono font-medium text-brand-300 mb-6 backdrop-blur-md">
        <Sparkles className="h-3.5 w-3.5 text-brand-400" />
        <span>Hardware-Sample Synchronized Audio</span>
      </div>

      {/* Main Heading */}
      <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-center max-w-2xl bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
        Listen together in perfect sync.
      </h1>

      <p className="mt-4 text-center text-sm sm:text-base text-zinc-400 max-w-md">
        Turn every phone, laptop, and speaker around you into a single unified sound system with sub-millisecond precision.
      </p>

      {/* Action Card */}
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 sm:p-8 mt-10 shadow-2xl shadow-black/50 border border-white/10">
        {/* Username input */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-zinc-300 mb-2">Your Display Name</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your name"
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/60"
          />
        </div>

        {/* Buttons Grid */}
        <div className="space-y-4">
          <form onSubmit={handleCreate}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-cyan-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Radio className="h-4 w-4" />
              <span>Create New Room</span>
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">or join room</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          <form onSubmit={handleJoin} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={handleCodeChange}
                placeholder="6-digit code"
                disabled={isAutoEntering}
                className={`flex-1 rounded-2xl bg-white/5 border px-4 py-3 text-center font-mono text-base font-bold tracking-widest text-white placeholder-zinc-500 focus:outline-none transition-all ${
                  joinCode.length === 6
                    ? 'border-cyan-500 shadow-lg shadow-cyan-500/20'
                    : 'border-white/10 focus:border-cyan-500/60'
                }`}
              />
              <button
                type="submit"
                disabled={joinCode.length < 6 || isAutoEntering}
                className="rounded-2xl bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:pointer-events-none px-5 py-3 text-sm font-bold text-white border border-white/10 transition-all flex items-center justify-center"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            {joinCode.length === 6 && (
              <p className="text-[11px] font-mono text-center text-cyan-400 animate-pulse">
                Auto-entering room {joinCode}...
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mt-12 w-full">
        <div className="glass-panel rounded-2xl p-4 text-center">
          <div className="h-8 w-8 rounded-lg bg-brand-500/10 text-brand-400 mx-auto flex items-center justify-center mb-2">
            <Sparkles className="h-4 w-4" />
          </div>
          <h4 className="text-xs font-bold text-white">Sub-Millisecond Sync</h4>
          <p className="text-[11px] text-zinc-400 mt-1">Web Audio hardware scheduling eliminates device start jitter.</p>
        </div>

        <div className="glass-panel rounded-2xl p-4 text-center">
          <div className="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-400 mx-auto flex items-center justify-center mb-2">
            <Music2 className="h-4 w-4" />
          </div>
          <h4 className="text-xs font-bold text-white">FreeToUse Streaming</h4>
          <p className="text-[11px] text-zinc-400 mt-1">Direct uncompressed MP3 streaming without ads or interruptions.</p>
        </div>

        <div className="glass-panel rounded-2xl p-4 text-center">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center mb-2">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <h4 className="text-xs font-bold text-white">Zero Database</h4>
          <p className="text-[11px] text-zinc-400 mt-1">Pure in-memory relay architecture for instant response time.</p>
        </div>
      </div>
    </div>
  );
};

