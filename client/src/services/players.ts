import type { MediaProvider } from '../types.js';
import { spotifyDevice } from './spotify.js';

export interface PlayerAdapter {
  readonly provider: MediaProvider;
  isReady(): boolean;
  isPlaying?(): boolean;
  getTime(): number;
  play(): void | Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  prime?(position: number, shouldPlay: boolean): void | Promise<void>;
  destroy(): void;
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
  private readonly player: YTPlayer;
  private readonly onReadyCallback?: () => void;
  private readonly onEndedCallback?: () => void;

  constructor(
    player: YTPlayer,
    onReadyCallback?: () => void,
    onEndedCallback?: () => void
  ) {
    this.player = player;
    this.onReadyCallback = onReadyCallback;
    this.onEndedCallback = onEndedCallback;
  }

  public markReady(): void {
    if (this.ready) return;
    this.ready = true;
    try {
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
        return this.player.getCurrentTime() || 0;
      }
    } catch {
      // ignore
    }
    return 0;
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
    try {
      if (typeof this.player?.seekTo === 'function') {
        this.player.seekTo(Math.max(0, seconds), true);
      }
    } catch {
      // ignore
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
            controls: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
            iv_load_policy: 3,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              try {
                const iframe = host.querySelector('iframe');
                if (iframe) {
                  iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
                  iframe.setAttribute('allowfullscreen', '1');
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

        adapter = new YouTubeAdapter(player, onReadyCallback, onEndedCallback);

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
