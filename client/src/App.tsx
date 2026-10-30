import { useState, useEffect } from 'react';
import { RoomEntryPage } from './pages/RoomEntryPage.js';
import { MusicRoomPage } from './pages/MusicRoomPage.js';
import type { RoomState, RoomUser } from './types.js';
import { socket, getStoredUserId, getStoredUsername } from './services/socket.js';

export function App() {
  const [currentView, setCurrentView] = useState<'entry' | 'room'>('entry');
  const [activeRoomState, setActiveRoomState] = useState<RoomState | null>(null);
  const [currentUser, setCurrentUser] = useState<RoomUser | null>(null);

  // Attempt automatic session restoration on browser refresh
  useEffect(() => {
    const savedRoomCode = sessionStorage.getItem('vybe_active_room_code');
    const storedUsername = getStoredUsername();
    const storedUserId = getStoredUserId();

    if (savedRoomCode && storedUsername) {
      // Re-join session
      socket.emit('room:join', {
        roomCode: savedRoomCode,
        username: storedUsername,
        userId: storedUserId
      });
    }

    const handleRoomJoined = (data: { roomCode: string; user: RoomUser; state: RoomState }) => {
      sessionStorage.setItem('vybe_active_room_code', data.roomCode);
      setActiveRoomState(data.state);
      setCurrentUser(data.user);
      setCurrentView('room');
    };

    const handleRoomCreated = (data: { roomCode: string; user: RoomUser; state: RoomState }) => {
      sessionStorage.setItem('vybe_active_room_code', data.roomCode);
      setActiveRoomState(data.state);
      setCurrentUser(data.user);
      setCurrentView('room');
    };

    socket.on('room:joined', handleRoomJoined);
    socket.on('room:created', handleRoomCreated);

    return () => {
      socket.off('room:joined', handleRoomJoined);
      socket.off('room:created', handleRoomCreated);
    };
  }, []);

  const handleJoinSuccess = (roomCode: string, user: RoomUser, state: RoomState) => {
    sessionStorage.setItem('vybe_active_room_code', roomCode);
    setActiveRoomState(state);
    setCurrentUser(user);
    setCurrentView('room');
  };

  const handleExitRoom = () => {
    sessionStorage.removeItem('vybe_active_room_code');
    setActiveRoomState(null);
    setCurrentUser(null);
    setCurrentView('entry');
  };

  return (
    <div className="w-full min-h-screen bg-[#090a10]">
      {currentView === 'entry' || !activeRoomState || !currentUser ? (
        <RoomEntryPage onJoinSuccess={handleJoinSuccess} />
      ) : (
        <MusicRoomPage
          initialState={activeRoomState}
          currentUser={currentUser}
          onExit={handleExitRoom}
        />
      )}
    </div>
  );
}

export default App;
