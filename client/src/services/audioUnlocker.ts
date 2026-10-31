/**
 * AudioUnlocker:
 * Automatically unlocks iOS Safari and mobile browser audio on the very first touch/click
 * anywhere on the page, preventing intrusive "Enable audio" popups.
 */

class AudioUnlocker {
  private unlocked = false;
  private readonly listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Register a callback to be called as soon as audio is unlocked by a user gesture.
   * If already unlocked, invokes immediately.
   */
  public onUnlock(callback: () => void): () => void {
    if (this.unlocked) {
      callback();
      return () => {};
    }
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Synchronously unlock audio inside any user interaction (touch, click, key).
   */
  public unlock = (): void => {
    if (this.unlocked) return;

    try {
      // 1. Resume Web Audio API AudioContext
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }

      // 2. Resume Howler AudioContext if present
      if (typeof (window as unknown as { Howler?: { ctx?: AudioContext } }).Howler?.ctx !== 'undefined') {
        const howlerCtx = (window as unknown as { Howler: { ctx: AudioContext } }).Howler.ctx;
        if (howlerCtx && howlerCtx.state === 'suspended') {
          void howlerCtx.resume();
        }
      }

      // 3. Play a 0-volume silent HTML5 audio element to unlock HTMLMediaElement on iOS WebKit
      const silentAudio = new Audio(
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
      );
      silentAudio.volume = 0.001;
      const playPromise = silentAudio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            silentAudio.pause();
            silentAudio.remove();
          })
          .catch(() => {});
      }

      this.unlocked = true;
      this.removeListeners();

      // Trigger all pending listeners
      for (const cb of this.listeners) {
        try {
          cb();
        } catch {}
      }
      this.listeners.clear();
    } catch {
      // Will retry on next interaction
    }
  };

  private init(): void {
    const events = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'];
    for (const evt of events) {
      window.addEventListener(evt, this.unlock, { capture: true, passive: true });
    }
  }

  private removeListeners(): void {
    const events = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'];
    for (const evt of events) {
      window.removeEventListener(evt, this.unlock, { capture: true });
    }
  }
}

export const audioUnlocker = new AudioUnlocker();
