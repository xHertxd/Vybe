import React, { useState, useEffect, useRef } from 'react';
import type { Participant } from '../types.js';
import { Users, Crown, Smartphone, CheckCircle2, MoreVertical, ShieldAlert, UserMinus } from 'lucide-react';

interface ParticipantListProps {
  participants: Participant[];
  selfId: string;
  isHost?: boolean;
  onTransferAdmin?: (newHostId: string) => void;
  onKickParticipant?: (targetUserId: string) => void;
}

interface ContextMenuState {
  userId: string;
  username: string;
  x: number;
  y: number;
}

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  selfId,
  isHost = false,
  onTransferAdmin,
  onKickParticipant,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close context menu on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    if (contextMenu) {
      window.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, user: Participant) => {
    // Only host can make admin or kick other participants
    if (!isHost || user.id === selfId) return;
    e.preventDefault();
    setContextMenu({
      userId: user.id,
      username: user.username,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleOpenDropdown = (e: React.MouseEvent, user: Participant) => {
    e.stopPropagation();
    if (!isHost || user.id === selfId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      userId: user.id,
      username: user.username,
      x: rect.left - 120,
      y: rect.bottom + 4,
    });
  };

  const handleMakeAdmin = (userId: string) => {
    onTransferAdmin?.(userId);
    setContextMenu(null);
  };

  const handleKick = (userId: string) => {
    onKickParticipant?.(userId);
    setContextMenu(null);
  };

  return (
    <div className="glass-panel w-full rounded-2xl p-5 sm:p-6 relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-white">Connected Devices ({participants.length})</h3>
        </div>
        {isHost && (
          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
            Right-click to manage
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {participants.map((user) => {
          const isSelf = user.id === selfId;
          const absDrift = Math.abs(user.driftMs || 0);

          let syncStatusText = '< 2ms';
          let syncStatusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

          if (absDrift > 40) {
            syncStatusText = `${absDrift}ms`;
            syncStatusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
          } else if (absDrift > 5) {
            syncStatusText = `${absDrift}ms`;
            syncStatusColor = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
          }

          return (
            <div
              key={user.id}
              onContextMenu={(e) => handleContextMenu(e, user)}
              className={`group flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/[0.04] px-3 py-2 transition-all ${
                isHost && !isSelf ? 'hover:bg-white/[0.05] hover:border-white/10 cursor-context-menu' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                  {user.isHost ? <Crown className="h-4 w-4 text-amber-400" /> : <Smartphone className="h-4 w-4" />}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-200 truncate">{user.username}</span>
                    {user.isHost && (
                      <span className="rounded bg-amber-500/20 px-1 py-0.2 font-mono text-[9px] text-amber-300 font-semibold">
                        ADMIN
                      </span>
                    )}
                    {isSelf && (
                      <span className="rounded bg-brand-500/20 px-1 py-0.2 font-mono text-[9px] text-brand-300">
                        YOU
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono ${syncStatusColor}`}>
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>{syncStatusText}</span>
                </div>

                {/* Manage trigger for host */}
                {isHost && !isSelf && (
                  <button
                    onClick={(e) => handleOpenDropdown(e, user)}
                    className="opacity-60 hover:opacity-100 p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
                    title="Manage participant"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            top: `${Math.min(contextMenu.y, window.innerHeight - 120)}px`,
            left: `${Math.min(contextMenu.x, window.innerWidth - 180)}px`,
          }}
          className="fixed z-50 w-44 rounded-xl bg-zinc-900/95 border border-white/15 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2.5 py-1 text-[11px] font-semibold text-zinc-400 border-b border-white/5 truncate mb-1">
            {contextMenu.username}
          </div>
          <button
            onClick={() => handleMakeAdmin(contextMenu.userId)}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/15 transition-all"
          >
            <Crown className="h-3.5 w-3.5 text-amber-400" />
            <span>Make Admin</span>
          </button>
          <button
            onClick={() => handleKick(contextMenu.userId)}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-red-400 hover:bg-red-500/15 transition-all"
          >
            <UserMinus className="h-3.5 w-3.5 text-red-400" />
            <span>Kick from Room</span>
          </button>
        </div>
      )}
    </div>
  );
};

