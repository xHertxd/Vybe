import React from 'react';
import type { Participant } from '@vybe/shared';
import { Users, Crown, Smartphone, Laptop, CheckCircle2 } from 'lucide-react';

interface ParticipantListProps {
  participants: Participant[];
  selfId: string;
}

export const ParticipantList: React.FC<ParticipantListProps> = ({ participants, selfId }) => {
  return (
    <div className="glass-panel w-full rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-white">Connected Devices ({participants.length})</h3>
        </div>
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
              className="flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/[0.04] px-3 py-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                  {user.isHost ? <Crown className="h-4 w-4 text-amber-400" /> : <Smartphone className="h-4 w-4" />}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-200 truncate">{user.username}</span>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

