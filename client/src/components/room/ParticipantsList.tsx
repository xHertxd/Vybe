import React, { useState } from 'react';
import type { RoomUser, SyncMetrics } from '../../types.js';
import { Crown, Wifi, WifiOff, LogOut, ShieldAlert, Activity, User } from 'lucide-react';

interface ParticipantsListProps {
  users: RoomUser[];
  currentUserId: string;
  isAdmin: boolean;
  roomCode: string;
  metrics: SyncMetrics;
  onLeaveRoom: () => void;
  onEndRoom: () => void;
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({
  users,
  currentUserId,
  isAdmin,
  metrics,
  onLeaveRoom,
  onEndRoom
}) => {
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
          <User className="w-4 h-4 text-purple-400" />
          <span>Participants</span>
          <span className="text-xs font-normal text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
            {users.length}
          </span>
        </h3>

        {/* Sync quality badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] border border-white/10 text-[11px] font-mono">
          <div
            className={`w-2 h-2 rounded-full ${
              metrics.inSync ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-300">
            {metrics.drift < 40 ? 'Perfect' : `±${metrics.drift}ms`}
          </span>
        </div>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1">
        {users.map((user) => {
          const isCurrentUser = user.id === currentUserId;
          return (
            <div
              key={user.id}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                isCurrentUser
                  ? 'bg-purple-950/20 border-purple-500/30'
                  : 'bg-white/[0.02] border-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Online Status Dot */}
                <div className="relative">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      user.isOnline ? 'bg-emerald-400' : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {user.username}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[10px] bg-white/10 text-slate-300 px-1.5 py-0.2 rounded font-medium">
                        You
                      </span>
                    )}
                    {user.isAdmin && (
                      <span className="flex items-center gap-1 text-[10px] bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 text-amber-300 font-bold px-1.5 py-0.5 rounded-md shadow-sm">
                        <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                        ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {user.isOnline ? 'Connected' : 'Reconnecting...'}
                  </p>
                </div>
              </div>

              {/* Ping / Latency metric */}
              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                {user.isOnline ? (
                  <>
                    <Wifi className="w-3 h-3 text-slate-500" />
                    <span>{isCurrentUser ? `${metrics.ping}ms` : `${user.ping || 18}ms`}</span>
                  </>
                ) : (
                  <WifiOff className="w-3 h-3 text-amber-400" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sync Diagnostics Mini-Panel */}
      <div className="p-3 my-2 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] font-mono text-slate-400 space-y-1">
        <div className="flex justify-between">
          <span className="flex items-center gap-1 text-slate-500">
            <Activity className="w-3 h-3 text-cyan-400" /> NTP Offset:
          </span>
          <span className="text-slate-300">{metrics.clockOffset >= 0 ? `+${metrics.clockOffset}` : metrics.clockOffset}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Round Trip (RTT):</span>
          <span className="text-slate-300">{metrics.ping * 2}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Correction Mode:</span>
          <span className="text-purple-400 uppercase text-[10px] font-semibold">{metrics.correctionMode}</span>
        </div>
      </div>

      {/* Room Controls: Leave Room & Admin End Room */}
      <div className="pt-3 border-t border-white/10 space-y-2">
        <button
          onClick={onLeaveRoom}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Leave Room</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setShowEndConfirm(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/20 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>End Room Session</span>
          </button>
        )}
      </div>

      {/* End Room Confirmation Dialog */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm bg-[#141622] border border-red-500/30 rounded-2xl p-6 shadow-2xl text-center">
            <ShieldAlert className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h4 className="text-base font-bold text-white">End Room for Everyone?</h4>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              This will immediately disconnect all participants, stop synchronized playback, and close the room code.
            </p>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-2 text-xs font-medium bg-white/10 hover:bg-white/15 text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  onEndRoom();
                }}
                className="flex-1 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors shadow-lg"
              >
                End Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
