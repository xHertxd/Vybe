/**
 * keepAlive.ts
 *
 * Keeps Vybe connected and active across devices even when:
 * 1. Screen dims or idle timers fire (via Screen Wake Lock API).
 * 2. Mobile apps / tabs are backgrounded (via silent WebAudio keep-alive thread).
 * 3. Mobile tabs resume from sleep (via immediate visibilitychange re-sync & reconnect).
 */

import { socket } from './socket.js';
import { clockSync } from './clockSync.js';

class KeepAliveService {
  private wakeLock: any = null;
  private audioCtx: AudioContext | null = null;
  private silentGain: GainNode | null = null;
  private silentOsc: OscillatorNode | null = null;
  private isActive = false;
  private roomCode: string | null = null;

  public start(roomCode?: string): void {
    if (roomCode) this.roomCode = roomCode;
    if (this.isActive) return;
    this.isActive = true;

    this.requestWakeLock();
    this.startSilentAudioThread();

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('focus', this.onFocus);
  }

  public stop(): void {
    this.isActive = false;
    this.roomCode = null;

    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('focus', this.onFocus);

    this.releaseWakeLock();
    this.stopSilentAudioThread();
  }

  public updateRoomCode(code: string | null): void {
    this.roomCode = code;
  }

  /**
   * Screen Wake Lock API: prevents the screen from dimming or locking
   * while listening to music with friends.
   */
  public async requestWakeLock(): Promise<void> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      if (!this.wakeLock) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      }
    } catch {
      // Ignored if browser restricts (e.g. low battery mode)
    }
  }

  public releaseWakeLock(): void {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch {}
      this.wakeLock = null;
    }
  }

  /**
   * Silent WebAudio thread keeps the browser's media process alive on iOS Safari
   * and Android Chrome so WebSocket heartbeats and audio sync are never suspended.
   */
  private startSilentAudioThread(): void {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      if (!this.silentOsc && this.audioCtx) {
        this.silentGain = this.audioCtx.createGain();
        this.silentGain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime); // Inaudible
        this.silentGain.connect(this.audioCtx.destination);

        this.silentOsc = this.audioCtx.createOscillator();
        this.silentOsc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        this.silentOsc.connect(this.silentGain);
        this.silentOsc.start();
      }
    } catch {
      // Non-critical if blocked by autoplay policy
    }
  }

  private stopSilentAudioThread(): void {
    try {
      if (this.silentOsc) {
        this.silentOsc.stop();
        this.silentOsc.disconnect();
        this.silentOsc = null;
      }
      if (this.silentGain) {
        this.silentGain.disconnect();
        this.silentGain = null;
      }
      if (this.audioCtx) {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
    } catch {}
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      // Tab restored to foreground!
      this.requestWakeLock();

      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      // Reconnect socket immediately if dropped during sleep
      if (!socket.connected) {
        socket.connect();
      }

      // Re-align NTP clock drift immediately
      clockSync.syncNow();

      if (this.roomCode) {
        socket.emit('room:get_state', { roomCode: this.roomCode });
      }
    }
  };

  private onFocus = (): void => {
    this.requestWakeLock();
    if (!socket.connected) {
      socket.connect();
    }
    clockSync.syncNow();
    if (this.roomCode) {
      socket.emit('room:get_state', { roomCode: this.roomCode });
    }
  };
}

export const keepAlive = new KeepAliveService();
