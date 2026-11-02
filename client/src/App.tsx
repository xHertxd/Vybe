import React, { useEffect, useRef } from 'react';
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
    addMultipleToQueue,
    reorderQueue,
    transferAdmin,
    kickParticipant,
    removeFromQueue,
    setVolume,
    unlockAudio,
  } = useRoom();

  const autoJoinAttempted = useRef(false);

  // 1. Direct URL sharing: Auto-join if user opens a direct link with ?room=123456 or /room/123456
  useEffect(() => {
    if (autoJoinAttempted.current || room) return;
    autoJoinAttempted.current = true;

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const queryRoom = searchParams.get('room') || searchParams.get('code');
      const pathMatch = window.location.pathname.match(/^\/room\/([a-zA-Z0-9]+)/);
      const pathRoom = pathMatch ? pathMatch[1] : null;

      const targetRoom = (queryRoom || pathRoom)?.trim();
      if (targetRoom) {
        const storedUsername =
          localStorage.getItem('vybe_username') ||
          `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
        void joinRoom(targetRoom, storedUsername);
      }
    } catch (e) {
      console.warn('[App] URL auto-join check failed:', e);
    }
  }, [joinRoom, room]);

  // 2. Direct URL synchronization: Keep address bar updated so copying from address bar directly works!
  useEffect(() => {
    try {
      if (room?.code) {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('room') !== room.code) {
          currentUrl.searchParams.set('room', room.code);
          window.history.replaceState({ room: room.code }, '', currentUrl.toString());
        }
      } else {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has('room') || currentUrl.searchParams.has('code')) {
          currentUrl.searchParams.delete('room');
          currentUrl.searchParams.delete('code');
          window.history.replaceState(null, '', currentUrl.pathname || '/');
        }
      }
    } catch (e) {
      console.warn('[App] URL history sync failed:', e);
    }
  }, [room?.code]);

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
            onAddMultipleToQueue={addMultipleToQueue}
            onReorderQueue={reorderQueue}
            onTransferAdmin={transferAdmin}
            onKickParticipant={kickParticipant}
            onRemoveFromQueue={removeFromQueue}
          />
        )}
      </main>
    </div>
  );
};

export default App;

