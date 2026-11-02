import React from 'react';
import { Navbar } from './components/Navbar.js';
import { HomePage } from './pages/HomePage.js';
import { RoomPage } from './pages/RoomPage.js';
import { useRoom } from './hooks/useRoom.js';

export const App: React.FC = () => {
  const {
    room,
    selfId,
    isHost,
    driftMs,
    currentTime,
    duration,
    isPlayingLocally,
    isAudioUnlocked,
    volume,
    createRoom,
    joinRoom,
    leaveRoom,
    togglePlayPause,
    seek,
    skipNext,
    addToQueue,
    removeFromQueue,
    setVolume,
    unlockAudio,
  } = useRoom();

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-[#f4f4f5]">
      <Navbar
        roomCode={room?.code}
        participantCount={room?.participants.length}
        driftMs={driftMs}
        isUnlocked={isAudioUnlocked}
        onUnlockAudio={unlockAudio}
        onLeaveRoom={room ? leaveRoom : undefined}
      />

      <main className="flex-1 flex flex-col">
        {!room ? (
          <HomePage
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
          />
        ) : (
          <RoomPage
            room={room}
            selfId={selfId}
            isHost={isHost}
            currentTime={currentTime}
            duration={duration}
            isPlayingLocally={isPlayingLocally}
            volume={volume}
            onTogglePlayPause={togglePlayPause}
            onSeek={seek}
            onSkipNext={skipNext}
            onVolumeChange={setVolume}
            onAddToQueue={addToQueue}
            onRemoveFromQueue={removeFromQueue}
          />
        )}
      </main>
    </div>
  );
};

export default App;

