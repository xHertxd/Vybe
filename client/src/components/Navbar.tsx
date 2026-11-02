import React, { useState } from 'react';
import { Volume2, VolumeX, Copy, Check, Users, Radio, Sparkles } from 'lucide-react';

interface NavbarProps {
  roomCode?: string;
  participantCount?: number;
  driftMs?: number;
  isUnlocked?: boolean;
  onUnlockAudio?: () => void;
  onLeaveRoom?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomCode,
  participantCount = 1,
  driftMs = 0,
  isUnlocked = true,
  onUnlockAudio,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (!roomCode) return;
    const url = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const absDrift = Math.abs(driftMs);
  let driftBadge = { text: 'Locked In', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' };
  if (absDrift > 40) {
    driftBadge = { text: `${absDrift}ms Drift`, color: 'border-amber-500/30 text-amber-400 bg-amber-500/10' };
  } else if (absDrift > 5) {
    driftBadge = { text: `${absDrift}ms Phase`, color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' };
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-500 shadow-lg shadow-brand-500/20">
            <Radio className="h-5 w-5 text-white animate-pulse-subtle" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold tracking-tight text-white text-lg">VYBE</span>
              <span className="rounded bg-brand-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-300">
                2.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">Sub-millisecond audio sync</p>
          </div>
        </div>

        {/* Room Details & Sync Pill (If in room) */}
        {roomCode && (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Drift Status */}
            <div className={`hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono font-medium ${driftBadge.color}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-ping" />
              <span>{driftBadge.text}</span>
            </div>

            {/* Room Code Pill */}
            <button
              onClick={handleCopyLink}
              title="Click to copy invite link"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-mono text-zinc-200 transition-all hover:bg-white/10 hover:border-white/20 active:scale-95"
            >
              <span className="text-zinc-400">ROOM:</span>
              <span className="font-bold text-white">{roomCode}</span>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
            </button>

            {/* Participants Count */}
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-300">
              <Users className="h-3.5 w-3.5 text-brand-400" />
              <span>{participantCount}</span>
            </div>

            {/* Audio Unlock Button if locked */}
            {!isUnlocked && onUnlockAudio && (
              <button
                onClick={onUnlockAudio}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30 transition-all animate-bounce"
              >
                <VolumeX className="h-3.5 w-3.5" />
                <span>Tap to Enable Audio</span>
              </button>
            )}

            {/* Leave Room Button */}
            {onLeaveRoom && (
              <button
                onClick={onLeaveRoom}
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-all"
              >
                Exit
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

