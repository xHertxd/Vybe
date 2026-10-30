import React, { useState, useEffect } from 'react';
import { socket, getStoredUserId, getStoredUsername, setStoredUsername } from '../services/socket.js';
import { AudioWaveformVisualizer } from '../components/visualizer/AudioWaveformVisualizer.js';
import { Radio, Sparkles, ArrowRight, Music, AlertCircle } from 'lucide-react';

interface RoomEntryPageProps {
  onJoinSuccess: (roomCode: string, user: any, state: any) => void;
}

export const RoomEntryPage: React.FC<RoomEntryPageProps> = ({ onJoinSuccess }) => {
  const [username, setUsername] = useState<string>(() => getStoredUsername() || '');
  const [roomCode, setRoomCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  // Monitor socket connection state
  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Listen for room join/create responses
    socket.on('room:created', (data: { roomCode: string; user: any; state: any }) => {
      setIsLoading(false);
      setStoredUsername(username.trim());
      onJoinSuccess(data.roomCode, data.user, data.state);
    });

    socket.on('room:joined', (data: { roomCode: string; user: any; state: any }) => {
      setIsLoading(false);
      setStoredUsername(username.trim());
      onJoinSuccess(data.roomCode, data.user, data.state);
    });

    socket.on('room:error', (data: { message: string }) => {
      setIsLoading(false);
      setErrorMessage(data.message);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room:created');
      socket.off('room:joined');
      socket.off('room:error');
    };
  }, [username, onJoinSuccess]);

  // Username validation helper: Alphabets only (A-Z, a-z)
  const validateUsername = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      return 'Please enter a username.';
    }
    if (!/^[a-zA-Z]+$/.test(trimmed)) {
      return 'Username must contain alphabetic characters only (A-Z, a-z), with no numbers or spaces.';
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      return 'Username must be between 2 and 20 characters.';
    }
    return null;
  };

  // Handle Create Room (Admin creation)
  const handleCreateRoom = () => {
    setErrorMessage(null);
    const userErr = validateUsername(username);
    if (userErr) {
      setErrorMessage(userErr);
      return;
    }

    setIsLoading(true);
    const userId = getStoredUserId();
    socket.emit('room:create', {
      username: username.trim(),
      userId
    });
  };

  // Handle Join Room (or auto-create if not found)
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const userErr = validateUsername(username);
    if (userErr) {
      setErrorMessage(userErr);
      return;
    }

    const cleanCode = roomCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorMessage('Room code must be exactly 6 numeric digits.');
      return;
    }

    setIsLoading(true);
    const userId = getStoredUserId();
    socket.emit('room:join', {
      roomCode: cleanCode,
      username: username.trim(),
      userId
    });
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between p-6 overflow-hidden bg-[#090a10]">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-purple-600/15 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/15 rounded-full blur-[128px] pointer-events-none" />

      {/* Top Header & Connection Pill */}
      <header className="w-full max-w-5xl flex items-center justify-between pt-2 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white m-0">
              VYBE
            </h1>
            <p className="text-[11px] font-medium text-slate-400">One Beat. Every Device.</p>
          </div>
        </div>

        {/* Server connection pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md">
          {isConnected ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-300 font-mono">Server Online</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
              <span className="text-xs text-red-300 font-mono">Connecting...</span>
            </>
          )}
        </div>
      </header>

      {/* Main Form Center Card */}
      <main className="w-full max-w-md my-auto py-8 z-10">
        <div className="glass-panel p-8 rounded-3xl shadow-2xl relative border border-white/10">
          {/* Subtle Top Waveform */}
          <div className="h-12 w-full mb-6 opacity-60">
            <AudioWaveformVisualizer isPlaying={true} barCount={28} />
          </div>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              Synchronized Listening
            </h2>
            <p className="text-xs text-slate-400 mt-1.5">
              Host a room or join one with a 6-digit code. Every device plays in sub-100ms sync.
            </p>
          </div>

          {/* Validation & Error Alert */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Editable Username Field */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Your Username <span className="text-slate-500 font-normal">(letters only)</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z]/g, '');
                setUsername(val);
                setErrorMessage(null);
              }}
              placeholder="e.g. Alex"
              maxLength={20}
              className="w-full px-4 py-3 bg-black/40 border border-white/10 focus:border-purple-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Usernames are unique per room (case-insensitive).
            </p>
          </div>

          {/* Action A: Create Room Button */}
          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={isLoading || !isConnected}
            className="w-full group relative flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-purple-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-purple-200 group-hover:rotate-12 transition-transform" />
            <span>Create New Room</span>
          </button>

          {/* Divider */}
          <div className="relative my-7 flex items-center justify-center">
            <div className="border-t border-white/10 w-full" />
            <span className="bg-[#12141e] px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider absolute">
              or join existing
            </span>
          </div>

          {/* Action B: Join Room Form */}
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                6-Digit Room Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={roomCode}
                onChange={(e) => {
                  const numeric = e.target.value.replace(/\D/g, '');
                  setRoomCode(numeric);
                  setErrorMessage(null);
                }}
                placeholder="123456"
                className="w-full px-4 py-3 bg-black/40 border border-white/10 focus:border-cyan-500 rounded-xl text-sm font-mono tracking-widest text-center text-white placeholder-slate-600 focus:outline-none transition-colors"
              />
              <p className="text-[10px] text-slate-500 mt-1 text-center">
                If the room code doesn&apos;t exist yet, it will be automatically created with you as Admin!
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isConnected || roomCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white font-semibold text-sm transition-all hover:border-cyan-500/50 disabled:opacity-40"
            >
              <span>Join Room</span>
              <ArrowRight className="w-4 h-4 text-cyan-400" />
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl flex items-center justify-between text-[11px] text-slate-500 border-t border-white/5 pt-4 z-10">
        <div>
          <span>Vybe Synchronized Engine • Sub-100ms Phase-Locked Audio</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Music className="w-3 h-3 text-purple-400" /> YouTube • Spotify • Web Audio
          </span>
        </div>
      </footer>
    </div>
  );
};
