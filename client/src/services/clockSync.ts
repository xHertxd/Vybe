import { socket } from './socket.js';

interface ClockSample {
  offset: number;
  rtt: number;
}

type ClockListener = (state: { offset: number; rtt: number; ready: boolean }) => void;

class ClockSync {
  private samples: ClockSample[] = [];
  private offset = 0;
  private rtt = 24;
  private ready = false;
  private started = false;
  private listeners = new Set<ClockListener>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private burstTimeouts: Array<ReturnType<typeof setTimeout>> = [];

  public start(): void {
    if (this.started) return;
    this.started = true;

    socket.on('sync:pong', (payload: { clientTime?: number; serverTime?: number }) => {
      if (typeof payload.clientTime !== 'number' || typeof payload.serverTime !== 'number') return;

      const receivedAt = Date.now();
      const roundTrip = Math.max(0, receivedAt - payload.clientTime);
      // Assume symmetric latency: server clock at receive time is serverTime + RTT/2.
      const sampleOffset = payload.serverTime + roundTrip / 2 - receivedAt;

      this.samples.push({ offset: sampleOffset, rtt: roundTrip });
      if (this.samples.length > 12) this.samples.shift();

      // Discard high-latency outliers for the median, keeping at least 3.
      const sortedByRtt = [...this.samples].sort((a, b) => a.rtt - b.rtt);
      const keep = sortedByRtt.slice(0, Math.max(3, Math.ceil(sortedByRtt.length * 0.7)));
      const offsets = keep.map((sample) => sample.offset).sort((a, b) => a - b);
      this.offset = offsets[Math.floor(offsets.length / 2)] ?? 0;
      this.rtt = sortedByRtt[0]?.rtt ?? this.rtt;
      this.ready = this.samples.length >= 2;
      this.emit();
    });

    socket.on('connect', () => {
      this.pingBurst();
      if (!this.interval) {
        this.interval = setInterval(() => this.ping(), 3_000);
      }
    });

    socket.on('disconnect', () => {
      this.ready = false;
      this.emit();
    });

    if (socket.connected) {
      this.pingBurst();
      this.interval = setInterval(() => this.ping(), 3_000);
    }
  }

  public syncNow(): void {
    this.pingBurst();
  }

  private pingBurst(): void {
    this.burstTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.burstTimeouts = [];
    [0, 120, 320, 650, 1_100].forEach((delay) => {
      this.burstTimeouts.push(setTimeout(() => this.ping(), delay));
    });
  }

  public ping(): void {
    if (!socket.connected) return;
    socket.emit('sync:ping', { clientTime: Date.now() });
  }

  private manualOffset = typeof window !== 'undefined' ? Number(localStorage.getItem('vybe_manual_nudge_ms') || 0) : 0;

  public getNudge(): number {
    return this.manualOffset;
  }

  public nudge(deltaMs: number): number {
    this.manualOffset = Math.max(-500, Math.min(500, this.manualOffset + deltaMs));
    try {
      localStorage.setItem('vybe_manual_nudge_ms', String(this.manualOffset));
    } catch {}
    this.emit();
    return this.manualOffset;
  }

  public resetNudge(): void {
    this.manualOffset = 0;
    try {
      localStorage.removeItem('vybe_manual_nudge_ms');
    } catch {}
    this.emit();
  }

  public getServerNow(): number {
    return Date.now() + this.offset + this.manualOffset;
  }

  public getMetrics(): { offset: number; rtt: number; ready: boolean } {
    return { offset: this.offset, rtt: this.rtt, ready: this.ready };
  }

  public subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    listener(this.getMetrics());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const metrics = this.getMetrics();
    this.listeners.forEach((listener) => listener(metrics));
  }
}

export const clockSync = new ClockSync();
