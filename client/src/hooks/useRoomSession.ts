import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomState, RoomUser, StoredSession } from '../types.js';
import { socket } from '../services/socket.js';
import { clockSync } from '../services/clockSync.js';
import {
  clearSession,
  getSavedUsername,
  readSession,
  saveUsername,
  writeSession,
} from '../services/session.js';

type Tone = 'info' | 'success' | 'error';
type Notify = (title: string, description?: string, tone?: Tone) => void;

interface UseRoomSessionOptions {
  notify: Notify;
  onEntered: (roomCode: string) => void;
  onLeft: () => void;
}

export type RoomPhase = 'idle' | 'connecting' | 'in-room' | 'reconnecting';

interface CreatedPayload {
  roomCode: string;
  user: RoomUser;
  state: RoomState;
  sessionToken: string;
}

interface JoinedPayload extends CreatedPayload {
  isNewRoom?: boolean;
  reconnected?: boolean;
}

const USERNAME_RE = /^[A-Za-z]{2,20}$/;

export function useRoomSession({ notify, onEntered, onLeft }: UseRoomSessionOptions) {
  const [phase, setPhase] = useState<RoomPhase>('idle');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [currentUser, setCurrentUser] = useState<RoomUser | null>(null);
  const [session, setSession] = useState<StoredSession | null>(() => readSession());
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [connected, setConnected] = useState(socket.connected);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const roomRef = useRef(room);
  roomRef.current = room;
  const resumeInFlight = useRef(false);
  const inRoomRef = useRef(false);

  const enter = useCallback(
    (payload: CreatedPayload, username: string) => {
      const stored: StoredSession = {
        roomCode: payload.roomCode,
        userId: payload.user.id,
        sessionToken: payload.sessionToken,
        username,
      };
      writeSession(stored);
      setSession(stored);
      setRoom(payload.state);
      setCurrentUser(payload.user);
      setPhase('in-room');
      inRoomRef.current = true;
      onEntered(payload.roomCode);
    },
    [onEntered]
  );

  const joinTimeoutRef = useRef<number | null>(null);

  const clearPendingTimeout = () => {
    if (joinTimeoutRef.current) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  };

  const createRoom = useCallback(
    (rawUsername: string) => {
      const username = rawUsername.trim();
      if (!USERNAME_RE.test(username)) {
        notify(
          'Check your username',
          'Use 2–20 letters only — no numbers, spaces or symbols.',
          'error'
        );
        return;
      }
      clearPendingTimeout();
      if (!socket.connected) {
        socket.connect();
      }
      saveUsername(username);
      setPhase('connecting');
      socket.emit('room:create', { username });

      joinTimeoutRef.current = window.setTimeout(() => {
        setPhase((prev) => {
          if (prev === 'connecting') {
            notify(
              'Connection timed out',
              'Server is not responding. Please make sure the backend is running.',
              'error'
            );
            return 'idle';
          }
          return prev;
        });
      }, 7000);
    },
    [notify]
  );

  const joinRoom = useCallback(
    (rawCode: string, rawUsername: string) => {
      const roomCode = rawCode.trim();
      const username = rawUsername.trim();

      if (!/^\d{6}$/.test(roomCode)) {
        notify('Invalid room code', 'Room codes are exactly 6 digits.', 'error');
        return;
      }
      if (!USERNAME_RE.test(username)) {
        notify(
          'Check your username',
          'Use 2–20 letters only — no numbers, spaces or symbols.',
          'error'
        );
        return;
      }
      clearPendingTimeout();
      if (!socket.connected) {
        socket.connect();
      }

      const existing = sessionRef.current;
      saveUsername(username);
      setPhase('connecting');
      socket.emit('room:join', {
        roomCode,
        username,
        userId: existing?.roomCode === roomCode ? existing.userId : undefined,
        sessionToken: existing?.roomCode === roomCode ? existing.sessionToken : undefined,
      });

      joinTimeoutRef.current = window.setTimeout(() => {
        setPhase((prev) => {
          if (prev === 'connecting') {
            notify(
              'Connection timed out',
              'Server is not responding. Please make sure the backend is running.',
              'error'
            );
            return 'idle';
          }
          return prev;
        });
      }, 7000);
    },
    [notify]
  );

  const leaveRoom = useCallback(() => {
    const active = roomRef.current;
    if (active) {
      socket.emit('room:leave', { roomCode: active.roomCode });
    }
    clearSession();
    setSession(null);
    setRoom(null);
    setCurrentUser(null);
    setPhase('idle');
    inRoomRef.current = false;
    onLeft();
  }, [onLeft]);

  const endRoom = useCallback(() => {
    const active = roomRef.current;
    if (!active) return;
    socket.emit('room:end', { roomCode: active.roomCode });
  }, []);

  useEffect(() => {
    clockSync.start();

    if (socket.connected) {
      setConnected(true);
      setConnectionIssue(false);
    } else {
      socket.connect();
    }

    const onConnect = () => {
      setConnectionIssue(false);
      setConnected(true);
      const stored = sessionRef.current;
      if (stored && !resumeInFlight.current) {
        resumeInFlight.current = true;
        setPhase('reconnecting');
        socket.emit('room:resume', {
          roomCode: stored.roomCode,
          userId: stored.userId,
          sessionToken: stored.sessionToken,
          username: stored.username,
        });
        window.setTimeout(() => {
          resumeInFlight.current = false;
        }, 4_000);
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      resumeInFlight.current = false;
      if (inRoomRef.current) {
        setPhase('reconnecting');
      } else {
        setPhase('idle');
      }
    };

    const onConnectError = () => {
      clearPendingTimeout();
      setConnectionIssue(true);
      setConnected(false);
      if (inRoomRef.current) {
        setPhase('reconnecting');
      } else {
        setPhase((previous) => (previous === 'connecting' ? 'idle' : previous));
      }
    };

    const onCreated = (payload: CreatedPayload) => {
      clearPendingTimeout();
      const username = getSavedUsername();
      resumeInFlight.current = false;
      enter(payload, username);
      notify('Room created', 'You are the admin. Drop a link to start the session.', 'success');
    };

    const onJoined = (payload: JoinedPayload) => {
      clearPendingTimeout();
      const username =
        payload.state.users.find((user) => user.id === payload.user.id)?.username ||
        getSavedUsername();
      resumeInFlight.current = false;
      inRoomRef.current = true;
      writeSession({
        roomCode: payload.roomCode,
        userId: payload.user.id,
        sessionToken: payload.sessionToken,
        username,
      });
      setSession({
        roomCode: payload.roomCode,
        userId: payload.user.id,
        sessionToken: payload.sessionToken,
        username,
      });
      setRoom(payload.state);
      setCurrentUser(payload.user);
      setPhase('in-room');
      onEntered(payload.roomCode);
      if (payload.reconnected) {
        notify('Back in sync', `Reconnected to room ${payload.roomCode}.`, 'success');
      } else if (payload.isNewRoom) {
        notify('Room created', `No room ${payload.roomCode} existed, so we made it.`, 'success');
      }
    };

    const onState = (state: RoomState) => {
      setRoom(state);
      setCurrentUser((previous) => {
        if (!previous) return previous;
        return state.users.find((user) => user.id === previous.id) || previous;
      });
    };

    const onPlayback = (playback: RoomState['playback']) => {
      setRoom((previous) => (previous ? { ...previous, playback } : previous));
    };

    const onQueue = (payload: { queue: RoomState['queue']; currentIndex: number }) => {
      setRoom((previous) =>
        previous
          ? { ...previous, queue: payload.queue, currentIndex: payload.currentIndex }
          : previous
      );
    };

    const onAdminChanged = (payload: { newAdminId: string; username: string }) => {
      setRoom((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          adminId: payload.newAdminId,
          users: previous.users.map((user) => ({
            ...user,
            isAdmin: user.id === payload.newAdminId,
          })),
        };
      });
      setCurrentUser((previous) =>
        previous
          ? {
              ...previous,
              isAdmin: previous.id === payload.newAdminId,
            }
          : previous
      );
      notify('New admin', `${payload.username} is now running the room.`, 'info');
    };

    const onUserLeft = (payload: { userId: string }) => {
      setRoom((previous) =>
        previous
          ? {
              ...previous,
              users: previous.users.filter((user) => user.id !== payload.userId),
            }
          : previous
      );
    };

    const onEnded = (payload: { reason?: string; message?: string }) => {
      clearSession();
      setSession(null);
      setRoom(null);
      setCurrentUser(null);
      setPhase('idle');
      inRoomRef.current = false;
      onLeft();
      notify(
        payload.reason === 'expired' ? 'Room expired' : 'Room ended',
        payload.message || 'This session is over.',
        'info'
      );
    };

    const onExpired = () => {
      clearSession();
      setSession(null);
      setRoom(null);
      setCurrentUser(null);
      setPhase('idle');
      inRoomRef.current = false;
      onLeft();
      notify('Session ended', 'That room is no longer active. Start or join another one.', 'info');
    };

    const onError = (payload: { message?: string; code?: string }) => {
      clearPendingTimeout();
      const message = payload?.message || 'Something went wrong.';
      const isResumeFailure =
        resumeInFlight.current &&
        (payload?.code === 'FORBIDDEN' || payload?.code === 'EXPIRED');

      if (isResumeFailure) {
        resumeInFlight.current = false;
        clearSession();
        setSession(null);
        setRoom(null);
        setCurrentUser(null);
        setPhase('idle');
        inRoomRef.current = false;
        onLeft();
      } else {
        setPhase((previous) => (previous === 'connecting' ? 'idle' : previous));
      }

      notify('Could not complete that', message, 'error');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:created', onCreated);
    socket.on('room:joined', onJoined);
    socket.on('room:state', onState);
    socket.on('playback:sync', onPlayback);
    socket.on('playback:heartbeat', onPlayback);
    socket.on('queue:updated', onQueue);
    socket.on('room:admin_changed', onAdminChanged);
    socket.on('room:user_left', onUserLeft);
    socket.on('room:ended', onEnded);
    socket.on('room:expired', onExpired);
    socket.on('room:error', onError);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:created', onCreated);
      socket.off('room:joined', onJoined);
      socket.off('room:state', onState);
      socket.off('playback:sync', onPlayback);
      socket.off('playback:heartbeat', onPlayback);
      socket.off('queue:updated', onQueue);
      socket.off('room:admin_changed', onAdminChanged);
      socket.off('room:user_left', onUserLeft);
      socket.off('room:ended', onEnded);
      socket.off('room:expired', onExpired);
      socket.off('room:error', onError);
    };
  }, [enter, notify, onEntered, onLeft]);

  return {
    phase,
    room,
    currentUser,
    session,
    connectionIssue,
    connected,
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,
    savedUsername: getSavedUsername(),
  };
}
