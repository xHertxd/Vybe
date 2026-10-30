import { setSpotifyReturnPath, takeSpotifyReturnPath } from './session.js';

const CLIENT_ID = ((import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || '').trim();
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
].join(' ');

const TOKENS_KEY = 'vybe_spotify_tokens';
const VERIFIER_KEY = 'vybe_spotify_verifier';
const REDIRECT_PATH = '/';

interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window?: { current_track?: { uri?: string; name?: string } };
}

interface SpotifySdkPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (payload: unknown) => void) => void;
  removeListener: (event: string) => void;
  activateElement: () => Promise<void>;
  getCurrentState: () => Promise<SpotifyPlayerState | null>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  getVolume: () => Promise<number>;
}

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume?: number;
      }) => SpotifySdkPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

function readTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpotifyTokens>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.expiresAt === 'number'
    ) {
      return parsed as SpotifyTokens;
    }
    return null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: SpotifyTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

export const spotify = {
  configured: Boolean(CLIENT_ID),

  isConnected(): boolean {
    return Boolean(readTokens());
  },

  getCallbackUrl(): string {
    return `${window.location.origin}${REDIRECT_PATH}`;
  },

  async beginAuth(returnPath: string): Promise<void> {
    if (!CLIENT_ID) {
      throw new Error(
        'Spotify is not configured on this deployment. Add VITE_SPOTIFY_CLIENT_ID to enable Spotify playback.'
      );
    }

    const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64UrlEncode(await sha256(verifier));
    localStorage.setItem(VERIFIER_KEY, verifier);
    setSpotifyReturnPath(returnPath);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: this.getCallbackUrl(),
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      show_dialog: 'false',
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  },

  /**
   * Completes the PKCE exchange when Spotify redirects back to the app.
   * Returns true when tokens were obtained.
   */
  async completeAuthFromUrl(): Promise<boolean> {
    const url = new URL(window.location.href);
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');

    if (error) {
      url.searchParams.delete('error');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      return false;
    }

    if (!code) return false;

    const verifier = localStorage.getItem(VERIFIER_KEY);
    localStorage.removeItem(VERIFIER_KEY);
    if (!verifier) return false;

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.getCallbackUrl(),
          code_verifier: verifier,
        }),
      });

      if (!response.ok) return false;
      const data = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!data.access_token || !data.refresh_token) return false;

      writeTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000,
      });

      const returnPath = takeSpotifyReturnPath();
      const cleanPath = url.pathname + url.hash;
      window.history.replaceState({}, '', returnPath || cleanPath || REDIRECT_PATH);
      return true;
    } catch {
      return false;
    }
  },

  disconnect(): void {
    localStorage.removeItem(TOKENS_KEY);
    localStorage.removeItem(VERIFIER_KEY);
  },

  async getAccessToken(): Promise<string | null> {
    const tokens = readTokens();
    if (!tokens) return null;
    if (Date.now() < tokens.expiresAt) return tokens.accessToken;

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
        }),
      });
      if (!response.ok) {
        this.disconnect();
        return null;
      }
      const data = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!data.access_token) {
        this.disconnect();
        return null;
      }
      writeTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || tokens.refreshToken,
        expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000,
      });
      return data.access_token;
    } catch {
      return null;
    }
  },

  async getProfile(): Promise<{ id: string; name: string; premium: boolean } | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        id?: string;
        display_name?: string;
        product?: string;
      };
      return {
        id: data.id || '',
        name: data.display_name || 'Spotify listener',
        premium: data.product === 'premium',
      };
    } catch {
      return null;
    }
  },
};

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('spotify-sdk');
    if (existing) {
      const check = setInterval(() => {
        if (window.Spotify) {
          clearInterval(check);
          resolve();
        }
      }, 150);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error('Spotify player timed out while loading.'));
      }, 12_000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'spotify-sdk';
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;

    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    script.onerror = () => reject(new Error('Could not load the Spotify player SDK.'));
    document.body.appendChild(script);

    setTimeout(() => {
      if (!window.Spotify) reject(new Error('Spotify player timed out while loading.'));
    }, 12_000);
  });
}

export class SpotifyPlayer {
  private player: SpotifySdkPlayer | null = null;
  private deviceId: string | null = null;
  private ready = false;
  private volume = 0.85;
  private active = false;
  private initializing: Promise<void> | null = null;

  public isReady(): boolean {
    return this.ready && this.active;
  }

  public async initialize(): Promise<void> {
    if (this.ready) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      const token = await spotify.getAccessToken();
      if (!token) throw new Error('Connect a Spotify Premium account first.');

      const profile = await spotify.getProfile();
      if (!profile) throw new Error('Could not read your Spotify account. Reconnect and try again.');
      if (!profile.premium) {
        throw new Error(
          'Spotify playback requires Spotify Premium. Your account is connected, but free accounts cannot stream in third-party players.'
        );
      }

      await loadSdk();
      if (!window.Spotify) throw new Error('Spotify player is unavailable in this browser.');

      await new Promise<void>((resolve, reject) => {
        const player = new window.Spotify!.Player({
          name: 'Vybe',
          getOAuthToken: (callback) => {
            void spotify.getAccessToken().then((fresh) => callback(fresh || token));
          },
          volume: this.volume,
        });
        this.player = player;

        player.addListener('ready', (payload) => {
          const deviceId = (payload as { device_id?: string }).device_id;
          if (!deviceId) {
            reject(new Error('Spotify did not expose a playback device.'));
            return;
          }
          this.deviceId = deviceId;
          this.ready = true;
          resolve();
        });

        player.addListener('not_ready', () => {
          this.ready = false;
        });

        player.addListener('authentication_error', () => {
          spotify.disconnect();
          this.ready = false;
          reject(new Error('Spotify authentication expired. Reconnect your account.'));
        });

        player.addListener('account_error', () => {
          reject(new Error('Spotify Premium is required for playback.'));
        });

        void player.connect().then((connected) => {
          if (!connected) reject(new Error('Spotify refused the playback connection.'));
        });
      });
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  /** Must be called from a user gesture the first time. */
  public async activate(): Promise<void> {
    await this.initialize();
    await this.player?.activateElement();
    this.active = true;
  }

  public async load(uri: string, positionSeconds: number): Promise<void> {
    await this.initialize();
    const token = await spotify.getAccessToken();
    if (!token || !this.deviceId) throw new Error('Spotify is not ready yet.');

    this.active = true;
    const positionMs = Math.max(0, Math.round(positionSeconds * 1000));

    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(this.deviceId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          'Spotify blocked playback. Open Spotify once on this device, then try again. Premium is required.'
        );
      }
      if (response.status === 404) {
        throw new Error('Spotify could not find an active device. Reconnect your account.');
      }
      throw new Error('Spotify could not start playback on this device.');
    }
  }

  public async play(): Promise<void> {
    await this.initialize();
    await this.player?.resume();
    this.active = true;
  }

  public pause(): void {
    void this.player?.pause();
  }

  public seek(positionSeconds: number): void {
    void this.player?.seek(Math.max(0, Math.round(positionSeconds * 1000)));
  }

  public async setVolume(value: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, value));
    await this.player?.setVolume(this.volume);
  }

  public async getPosition(): Promise<number> {
    const state = await this.player?.getCurrentState();
    return state ? state.position / 1000 : 0;
  }

  public isPaused(): boolean {
    return !this.active;
  }

  public destroy(): void {
    this.player?.disconnect();
    this.player = null;
    this.deviceId = null;
    this.ready = false;
    this.active = false;
  }
}

export const spotifyDevice = new SpotifyPlayer();

