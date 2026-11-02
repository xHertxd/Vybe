import { socket } from './socket.js';
import type { SyncPingPayload, SyncPongPayload } from '../types.js';

interface ClockSample {
  offset: number; // serverTime - (clientSendTime + rtt/2)
  rtt: number; // round-trip time ms
}

class NtpClock {
  private offset = 0;
  private samples: ClockSample[] = [];
  private isSynchronized = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    socket.on('sync:pong', (payload: SyncPongPayload) => {
      const now = Date.now();
      const rtt = Math.max(0, now - payload.clientTime);

      // Assumes symmetric latency: server time when ping arrived was serverTime + rtt/2
      const calculatedOffset = payload.serverTime + rtt / 2 - now;

      this.samples.push({ offset: calculatedOffset, rtt });
      if (this.samples.length > 15) {
        this.samples.shift();
      }

      // Filter: sort by lowest RTT, select top 50% lowest jitter samples
      const sortedByRtt = [...this.samples].sort((a, b) => a.rtt - b.rtt);
      const cleanest = sortedByRtt.slice(0, Math.max(3, Math.ceil(sortedByRtt.length * 0.5)));

      // Take median of cleanest offsets
      const sortedOffsets = cleanest.map((s) => s.offset).sort((a, b) => a - b);
      this.offset = sortedOffsets[Math.floor(sortedOffsets.length / 2)] ?? this.offset;
      this.isSynchronized = this.samples.length >= 2;
    });

    socket.on('connect', () => {
      this.burstPing();
      if (!this.pingInterval) {
        this.pingInterval = setInterval(() => this.ping(), 4_000);
      }
    });

    socket.on('disconnect', () => {
      this.isSynchronized = false;
    });

    if (socket.connected) {
      this.burstPing();
      this.pingInterval = setInterval(() => this.ping(), 4_000);
    }
  }

  public burstPing(): void {
    // Fire a burst of 5 pings with staggered delays to establish instant sync
    [0, 100, 250, 500, 900].forEach((delay) => {
      setTimeout(() => this.ping(), delay);
    });
  }

  public ping(): void {
    if (!socket.connected) return;
    const payload: SyncPingPayload = { clientTime: Date.now() };
    socket.emit('sync:ping', payload);
  }

  /**
   * Returns authoritative server timestamp in milliseconds.
   */
  public getServerNow(): number {
    return Date.now() + this.offset;
  }

  public getOffset(): number {
    return this.offset;
  }

  public isReady(): boolean {
    return this.isSynchronized;
  }
}

export const ntpClock = new NtpClock();

