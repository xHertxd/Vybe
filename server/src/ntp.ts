import type { Socket } from 'socket.io';
import type { SyncPingPayload, SyncPongPayload } from '@vybe/shared';

export function setupNtpHandler(socket: Socket): void {
  socket.on('sync:ping', (payload: SyncPingPayload) => {
    const clientTime = typeof payload?.clientTime === 'number' ? payload.clientTime : Date.now();
    const pong: SyncPongPayload = {
      clientTime,
      serverTime: Date.now(),
    };
    socket.emit('sync:pong', pong);
  });
}

