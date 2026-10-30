import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useRoomSession } from './hooks/useRoomSession.js';
import { RoomEntryPage } from './pages/RoomEntryPage.js';
import { MusicRoomPage } from './pages/MusicRoomPage.js';
import { Toasts } from './components/Toasts.js';
import { Brand } from './components/Brand.js';
import { spotify } from './services/spotify.js';
import type { ToastMessage } from './types.js';

type Tone = 'info' | 'success' | 'error';

function parseRoomPath(): string | null {
  const match = window.location.pathname.match(/^\/room\/(\d{6})\/?$/);
  return match ? match[1] : null;
}

export function App() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const [routeCode, setRouteCode] = useState<string | null>(() => parseRoomPath());
  const [bootChecked, setBootChecked] = useState(false);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((title: string, description?: string, tone: Tone = 'info') => {
    const id = (toastId.current += 1);
    setToasts((current) => [...current.slice(-3), { id, title, description, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5_500);
  }, []);

  const onEntered = useCallback(
    (roomCode: string) => {
      const target = `/room/${roomCode}`;
      if (window.location.pathname !== target) {
        window.history.replaceState({}, '', target);
      }
      setRouteCode(roomCode);
    },
    []
  );

  const onLeft = useCallback(() => {
    if (window.location.pathname.startsWith('/room/')) {
      window.history.replaceState({}, '', '/');
    }
    setRouteCode(null);
  }, []);

  const {
    phase,
    room,
    currentUser,
    connectionIssue,
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,
    savedUsername,
  } = useRoomSession({ notify, onEntered, onLeft });

  // Finish Spotify PKCE before restoring a deep link, then honour the URL.
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const linked = await spotify.completeAuthFromUrl();
      if (cancelled) return;
      if (linked) {
        notify(
          'Spotify connected',
          'Your Premium account is linked. Spotify tracks will play on this device.',
          'success'
        );
      }
      setRouteCode(parseRoomPath());
      setBootChecked(true);
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    const onPopState = () => {
      // While actively in a room, keep the room URL authoritative.
      if (!room) setRouteCode(parseRoomPath());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [room]);

  // If user is at root "/" without a routeCode, do not trap them on BootScreen
  const showBoot =
    !room &&
    Boolean(routeCode) &&
    (phase === 'reconnecting' || (phase === 'connecting' && !bootChecked));

  return (
    <>
      {room && currentUser ? (
        <MusicRoomPage
          room={room}
          currentUser={currentUser}
          onLeave={leaveRoom}
          onEndRoom={endRoom}
          notify={notify}
        />
      ) : showBoot ? (
        <BootScreen phase={phase} connectionIssue={connectionIssue} />
      ) : (
        <RoomEntryPage
          onCreate={createRoom}
          onJoin={joinRoom}
          initialUsername={savedUsername}
          initialCode={routeCode ?? undefined}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

function BootScreen({ phase, connectionIssue }: { phase: string; connectionIssue: boolean }) {
  const message = connectionIssue
    ? 'Connecting to room…'
    : phase === 'reconnecting'
      ? 'Restoring your seat in the room…'
      : 'Opening your room…';

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6 bg-[#171719] text-[#fde5b7]">
      <div className="animate-rise flex w-full max-w-sm flex-col items-center text-center">
        <Brand size="lg" />
        <div className="panel mt-8 w-full rounded-[32px] p-8 border border-white/5 bg-[#262629]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-[#1c1c1f]">
            {connectionIssue ? (
              <WifiOff className="h-6 w-6 text-red-400" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-[#fde5b7]" />
            )}
          </div>
          <p className="mt-4 text-base font-bold text-[#fde5b7]">{message}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-[#a8a29e]">
            Synchronizing room audio clock for your device.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
