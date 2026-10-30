import type { MediaProvider } from '../types.js';
import { Howl, Howler } from 'howler';
import { spotifyDevice } from './spotify.js';

export interface PlayerAdapter {
  readonly provider: MediaProvider;
  isReady(): boolean;
  isPlaying?(): boolean;
  getTime(): number;
  getDuration?(): number;
  play(): void | Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  prime?(position: number, shouldPlay: boolean): void | Promise<void>;
  destroy(): void;
}

export class HowlerAudioAdapter implements PlayerAdapter {
  public readonly provider = 'audio' as const;
  private sound: Howl | null = null;
  private ready = false;
  private volume = 0.8;
  private currentPos = 0;
  private readonly url: string;
  private readonly onReadyCallback?: () => void;
  private readonly onEndedCallback?: () => void;
  private readonly onErrorCallback?: (err: string) => void;

  constructor(
    url: string,
    volume = 0.8,
    onReady?: () => void,
    onEnded?: () => void,
    onError?: (err: string) => void
  ) {
    this.url = url;
    this.volume = volume;
    this.onReadyCallback = onReady;
    this.onEndedCallback = onEnded;
    this.onErrorCallback = onError;

    this.initHowl(false); // Prefer Web Audio API for sample-accurate instant seeks and zero latency
  }

  private initHowl(useHtml5: boolean): void {
    if (this.sound) {
      try {
        this.sound.unload();
      } catch {}
      this.sound = null;
    }

    this.sound = new Howl({
      src: [this.url],
      html5: useHtml5,
      preload: true,
      volume: this.volume,
      autoplay: false,
      onload: () => {
        this.ready = true;
        if (this.currentPos > 0) {
          try {
            this.sound?.seek(this.currentPos);
          } catch {}
        }
        this.onReadyCallback?.();
      },
      onplay: (id) => {
        if (this.currentPos > 0) {
          try {
            this.sound?.seek(this.currentPos, id);
          } catch {}
        }
      },
      onend: () => {
        this.onEndedCallback?.();
      },
      onloaderror: (_id, err) => {
        if (!useHtml5) {
          // If WebAudio API failed (e.g. cross-origin CORS headers absent), fallback to HTML5 Audio streaming
          this.initHowl(true);
        } else {
          this.onErrorCallback?.(`Audio error: ${err}`);
        }
      },
      onplayerror: (_id, _err) => {
        this.sound?.once('unlock', () => {
          this.sound?.play();
          if (this.currentPos > 0) {
            try {
              this.sound?.seek(this.currentPos);
            } catch {}
          }
        });
      },
    });

    if (this.sound.state() === 'loaded') {
      this.ready = true;
      if (this.currentPos > 0) {
        this.sound.seek(this.currentPos);
      }
    }
  }

  public isReady(): boolean {
    return this.ready || this.sound?.state() === 'loaded';
  }

  public isPlaying(): boolean {
    return Boolean(this.sound?.playing());
  }

  public getTime(): number {
    if (!this.sound) return this.currentPos;
    const pos = this.sound.seek();
    if (typeof pos === 'number' && Number.isFinite(pos) && pos > 0) {
      this.currentPos = pos;
      return pos;
    }
    return this.currentPos;
  }

  public getDuration(): number {
    return this.sound?.duration() || 0;
  }

  public async play(): Promise<void> {
    if (!this.sound) return;
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      await Howler.ctx.resume().catch(() => {});
    }
    const id = this.sound.play();
    if (this.currentPos > 0) {
      try {
        this.sound.seek(this.currentPos, id);
      } catch {}
    }
  }

  public pause(): void {
    this.sound?.pause();
  }

  public seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.currentPos = Math.max(0, seconds);
    if (!this.sound) return;
    const dur = this.sound.duration();
    const maxSeek = dur && Number.isFinite(dur) && dur > 0.5 ? Math.max(0, dur - 0.25) : 3600;
    const clamped = Math.min(maxSeek, this.currentPos);
    try {
      this.sound.seek(clamped);
    } catch {}
  }

  public setRate(rate: number): void {
    if (!this.sound) return;
    const clampedRate = Math.max(0.85, Math.min(1.15, rate));
    try {
      this.sound.rate(clampedRate);
    } catch {}
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sound?.volume(this.volume);
  }

  public async prime(position: number, shouldPlay: boolean): Promise<void> {
    this.seek(position);
    if (shouldPlay) {
      await this.play();
    } else {
      this.pause();
    }
  }

  public destroy(): void {
    if (this.sound) {
      try {
        this.sound.stop();
        this.sound.unload();
      } catch {}
      this.sound = null;
    }
  }
}

export class AudioAdapter implements PlayerAdapter {
  public readonly provider = 'audio' as const;
  private ready = false;
  private readonly element: HTMLAudioElement;
  private readonly onReadyCallback?: () => void;
  private readonly onEndedCallback?: () => void;

  constructor(element: HTMLAudioElement, onReady?: () => void, onEnded?: () => void) {
    this.element = element;
    this.onReadyCallback = onReady;
    this.onEndedCallback = onEnded;
    if (element.readyState >= 1) this.ready = true;
    element.addEventListener('loadedmetadata', this.onReady);
    element.addEventListener('canplay', this.onReady);
    element.addEventListener('ended', this.onEnded);
  }

  private onReady = (): void => {
    if (this.ready) return;
    this.ready = true;
    this.onReadyCallback?.();
  };

  private onEnded = (): void => {
    this.onEndedCallback?.();
  };

  public isReady(): boolean {
    return this.ready;
  }

  public isPlaying(): boolean {
    return !this.element.paused && !this.element.ended;
  }

  public getTime(): number {
    return this.element.currentTime || 0;
  }

  public async play(): Promise<void> {
    await this.element.play();
  }

  public pause(): void {
    this.element.pause();
  }

  public seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      const dur = this.element.duration;
      const maxSeek = dur && Number.isFinite(dur) && dur > 0.5 ? Math.max(0, dur - 0.25) : 29.8;
      this.element.currentTime = Math.min(maxSeek, Math.max(0, seconds));
    }
  }

  public setRate(rate: number): void {
    this.element.playbackRate = Math.max(0.9, Math.min(1.1, rate));
  }

  public setVolume(volume: number): void {
    this.element.volume = Math.max(0, Math.min(1, volume));
  }

  public destroy(): void {
    this.element.removeEventListener('loadedmetadata', this.onReady);
    this.element.removeEventListener('canplay', this.onReady);
    this.element.removeEventListener('ended', this.onEnded);
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  unMute?: () => void;
  mute?: () => void;
  destroy: () => void;
  loadVideoById?: (id: string) => void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube player API loaded without a Player.'));
    };

    if (document.querySelector('script[data-vybe-youtube]')) {
      const check = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(check);
          finish();
        }
      }, 120);
      window.setTimeout(() => {
        window.clearInterval(check);
        if (!window.YT?.Player) reject(new Error('YouTube player API timed out.'));
      }, 12_000);
      return;
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      finish();
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.vybeYoutube = 'true';
    script.onerror = () => reject(new Error('Could not load the YouTube player.'));
    document.head.appendChild(script);

    window.setTimeout(() => {
      if (!window.YT?.Player) reject(new Error('YouTube player API timed out.'));
    }, 12_000);
  });

  return youtubeApiPromise;
}

const YOUTUBE_ERRORS: Record<number, string> = {
  2: 'That YouTube link is not a valid video.',
  5: 'This video cannot play in the current browser.',
  100: 'That YouTube video is private or has been removed.',
  101: 'The video owner does not allow playback outside YouTube.',
  150: 'The video owner does not allow playback outside YouTube.',
};

export class YouTubeAdapter implements PlayerAdapter {
  public readonly provider = 'youtube' as const;
  private ready = false;
  private errorMessage: string | null = null;
  private volume = 85;
  private currentPos = 0;
  private readonly player: YTPlayer;
  private readonly onReadyCallback?: () => void;
  private readonly onEndedCallback?: () => void;

  constructor(
    player: YTPlayer,
    initialPos = 0,
    onReadyCallback?: () => void,
    onEndedCallback?: () => void
  ) {
    this.player = player;
    this.currentPos = initialPos;
    this.onReadyCallback = onReadyCallback;
    this.onEndedCallback = onEndedCallback;
  }

  public markReady(): void {
    if (this.ready) return;
    this.ready = true;
    try {
      if (this.currentPos > 0 && typeof this.player?.seekTo === 'function') {
        this.player.seekTo(this.currentPos, true);
      }
      if (typeof this.player?.setVolume === 'function') {
        this.player.setVolume(this.volume);
      }
    } catch {
      // ignore
    }
    this.onReadyCallback?.();
  }

  public markEnded(): void {
    this.onEndedCallback?.();
  }

  public setError(message: string): void {
    this.errorMessage = message;
  }

  public getError(): string | null {
    return this.errorMessage;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getTime(): number {
    try {
      if (typeof this.player?.getCurrentTime === 'function') {
        const t = this.player.getCurrentTime() || 0;
        if (t > 0) this.currentPos = t;
        return t || this.currentPos;
      }
    } catch {
      // ignore
    }
    return this.currentPos;
  }

  public getDuration(): number {
    try {
      if (typeof this.player?.getDuration === 'function') {
        return this.player.getDuration() || 0;
      }
    } catch {
      // ignore
    }
    return 0;
  }

  public isPlaying(): boolean {
    try {
      if (window.YT && typeof this.player?.getPlayerState === 'function') {
        return this.player.getPlayerState() === window.YT.PlayerState.PLAYING;
      }
    } catch {
      // ignore
    }
    return false;
  }

  public play(): void {
    try {
      if (typeof this.player?.unMute === 'function') {
        this.player.unMute();
      }
      if (typeof this.player?.setVolume === 'function') {
        this.player.setVolume(this.volume);
      }
      if (typeof this.player?.playVideo === 'function') {
        this.player.playVideo();
      }
    } catch {
      // ignore
    }
  }

  public pause(): void {
    try {
      if (typeof this.player?.pauseVideo === 'function') {
        this.player.pauseVideo();
      }
    } catch {
      // ignore
    }
  }

  public seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.currentPos = Math.max(0, seconds);
    try {
      if (typeof this.player?.seekTo === 'function') {
        this.player.seekTo(this.currentPos, true);
      }
    } catch {
      // ignore
    }
  }

  public async prime(position: number, shouldPlay: boolean): Promise<void> {
    this.seek(position);
    if (shouldPlay) {
      this.play();
    } else {
      this.pause();
    }
  }

  public setRate(rate: number): void {
    try {
      if (typeof this.player?.setPlaybackRate === 'function') {
        this.player.setPlaybackRate(rate);
      }
    } catch {
      // ignore
    }
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume)) * 100;
    try {
      if (typeof this.player?.setVolume === 'function') {
        this.player.setVolume(this.volume);
      }
    } catch {
      // ignore
    }
  }

  public destroy(): void {
    try {
      if (typeof this.player?.destroy === 'function') {
        this.player.destroy();
      }
    } catch {
      // The iframe may already be gone during navigation.
    }
  }
}

export function createYouTubeAdapter(
  host: HTMLElement,
  videoId: string,
  initialPos = 0,
  onReadyCallback?: () => void,
  onEndedCallback?: () => void
): Promise<YouTubeAdapter> {
  return loadYouTubeApi().then(
    (YT) =>
      new Promise<YouTubeAdapter>((resolve, reject) => {
        const mount = document.createElement('div');
        mount.className = 'h-full w-full';
        host.replaceChildren(mount);

        let settled = false;
        let adapter: YouTubeAdapter | null = null;

        const player = new YT.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            start: Math.floor(initialPos),
            controls: 0,
            showinfo: 0,
            rel: 0,
            iv_load_policy: 3,
            cc_load_policy: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            modestbranding: 1,
            enablejsapi: 1,
            autohide: 1,
            origin: window.location.origin,
            widget_referrer: window.location.origin,
          },
          events: {
            onReady: () => {
              try {
                const iframe = host.querySelector('iframe');
                if (iframe) {
                  iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
                  iframe.setAttribute('allowfullscreen', '1');
                  iframe.style.pointerEvents = 'none';
                }
              } catch {}
              if (adapter) {
                adapter.markReady();
              }
              if (!settled && adapter) {
                settled = true;
                resolve(adapter);
              }
            },
            onStateChange: (event) => {
              if (event.data === 0) { // 0 = YT.PlayerState.ENDED
                adapter?.markEnded();
              }
            },
            onError: (event) => {
              const message =
                YOUTUBE_ERRORS[event.data] ||
                'This YouTube video could not play inside Vybe. Open it on YouTube instead.';
              adapter?.setError(message);
              if (!settled) {
                settled = true;
                reject(new Error(message));
              }
            },
          },
        });

        adapter = new YouTubeAdapter(player, initialPos, onReadyCallback, onEndedCallback);

        window.setTimeout(() => {
          if (!settled && adapter) {
            settled = true;
            adapter.markReady();
            resolve(adapter);
          }
        }, 3_500);
      })
  );
}

export class SpotifyAdapter implements PlayerAdapter {
  public readonly provider = 'spotify' as const;
  private ready = false;
  private primed = false;
  private errorMessage: string | null = null;
  private readonly uri: string;

  constructor(uri: string) {
    this.uri = uri;
  }

  public setReady(value: boolean): void {
    this.ready = value;
  }

  public setError(message: string | null): void {
    this.errorMessage = message;
  }

  public getError(): string | null {
    return this.errorMessage;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getTime(): number {
    // Position is not cheaply available synchronously; the sync loop reads the
    // last known position from the SDK instead.
    return this.lastPosition;
  }

  private lastPosition = 0;

  public async refreshPosition(): Promise<number> {
    this.lastPosition = await spotifyDevice.getPosition();
    return this.lastPosition;
  }

  public isPaused(): boolean {
    return spotifyDevice.isPaused();
  }

  public isPlaying(): boolean {
    return !spotifyDevice.isPaused();
  }

  public async play(): Promise<void> {
    await spotifyDevice.play();
  }

  public pause(): void {
    spotifyDevice.pause();
  }

  public seek(seconds: number): void {
    this.lastPosition = seconds;
    spotifyDevice.seek(seconds);
  }

  public setRate(_rate: number): void {
    // Spotify's playback rate is fixed at 1x.
  }

  public setVolume(volume: number): void {
    void spotifyDevice.setVolume(volume);
  }

  public async prime(position: number, shouldPlay: boolean): Promise<void> {
    if (this.primed) return;
    this.primed = true;
    this.lastPosition = position;
    await spotifyDevice.load(this.uri, position);
    if (!shouldPlay) spotifyDevice.pause();
  }

  public destroy(): void {
    spotifyDevice.pause();
  }
}
