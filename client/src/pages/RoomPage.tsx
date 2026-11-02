import React, { useState } from 'react';
import type { RoomState, Track } from '../types.js';
import { NowPlayingCard } from '../components/NowPlayingCard.js';
import { QueueList } from '../components/QueueList.js';
import { ParticipantList } from '../components/ParticipantList.js';
import { SearchModal } from '../components/SearchModal.js';
import { useSpacebar } from '../lib/spacebar.js';

interface RoomPageProps {
  room: RoomState;
  selfId: string;
  isHost: boolean;
  currentTime: number;
  duration: number;
  isPlayingLocally: boolean;
  volume: number;
  onTogglePlayPause: () => void;
  onSeek: (seconds: number) => void;
  onSkipNext: () => void;
  onVolumeChange: (vol: number) => void;
  onAddToQueue: (track: Track) => void;
  onRemoveFromQueue: (trackId: string) => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({
  room,
  selfId,
  isHost,
  currentTime,
  duration,
  isPlayingLocally,
  volume,
  onTogglePlayPause,
  onSeek,
  onSkipNext,
  onVolumeChange,
  onAddToQueue,
  onRemoveFromQueue,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Spacebar strictly toggles play/pause with text-input safeguards
  useSpacebar(onTogglePlayPause, true);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left / Center: Now Playing Card */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <NowPlayingCard
            playback={room.playback}
            currentTime={currentTime}
            duration={duration}
            isPlayingLocally={isPlayingLocally}
            volume={volume}
            onTogglePlayPause={onTogglePlayPause}
            onSeek={onSeek}
            onSkipNext={onSkipNext}
            onVolumeChange={onVolumeChange}
            onOpenSearch={() => setIsSearchOpen(true)}
          />
        </div>

        {/* Right Column: Queue & Participants */}
        <div className="lg:col-span-5 space-y-6">
          <QueueList
            queue={room.queue}
            queueIndex={room.queueIndex}
            onRemoveTrack={onRemoveFromQueue}
            onOpenSearch={() => setIsSearchOpen(true)}
          />

          <ParticipantList
            participants={room.participants}
            selfId={selfId}
          />
        </div>
      </div>

      {/* Music Search / Upload Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onAddTrack={onAddToQueue}
      />
    </div>
  );
};

