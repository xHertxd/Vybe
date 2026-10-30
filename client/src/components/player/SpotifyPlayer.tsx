import React, { useState, useEffect } from 'react';
import type { UnifiedMediaItem, PlaybackState } from '../../types.js';
import { ExternalLink, Key, CheckCircle, Disc3 } from 'lucide-react';

interface SpotifyPlayerProps {
  track: UnifiedMediaItem | null;
  playbackState: PlaybackState;
  roomCode: string;
  isAdmin: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export const SpotifyPlayer: React.FC<SpotifyPlayerProps> = ({
  track,
  playbackState,
  onTimeUpdate
}) => {
  const [spotifyToken, setSpotifyToken] = useState<string>(() => {
    return localStorage.getItem('vybe_spotify_token') || '';
  });
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [inputToken, setInputToken] = useState('');
  const [isSdkConnected, setIsSdkConnected] = useState(false);

  // Synchronized time ticker for Spotify tracks
  useEffect(() => {
    if (!track || track.provider !== 'spotify') return;

    const interval = setInterval(() => {
      if (playbackState.status === 'playing') {
        const scheduledTime = playbackState.scheduledStartTime || playbackState.serverTimestamp;
        const now = Date.now();
        const elapsed = Math.max(0, (now - scheduledTime) / 1000);
        const currentPos = Math.min(track.duration, playbackState.position + elapsed);
        if (onTimeUpdate) {
          onTimeUpdate(currentPos, track.duration);
        }
      } else {
        if (onTimeUpdate) {
          onTimeUpdate(playbackState.position, track.duration);
        }
      }
    }, 400);

    return () => clearInterval(interval);
  }, [track, playbackState, onTimeUpdate]);

  if (!track || track.provider !== 'spotify') {
    return null;
  }

  const handleSaveToken = () => {
    if (inputToken.trim()) {
      localStorage.setItem('vybe_spotify_token', inputToken.trim());
      setSpotifyToken(inputToken.trim());
      setIsSdkConnected(true);
      setShowTokenModal(false);
    }
  };

  const handleClearToken = () => {
    localStorage.removeItem('vybe_spotify_token');
    setSpotifyToken('');
    setIsSdkConnected(false);
  };

  const spotifyUrl = track.url || `https://open.spotify.com/track/${track.mediaId}`;

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center">
      {/* Spotify Integration Notice & Authentication Status */}
      <div className="w-full mb-4 p-3 rounded-xl bg-[#1db954]/10 border border-[#1db954]/30 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#1db954] flex items-center justify-center shrink-0">
            <Disc3 className="w-4 h-4 text-black animate-spin" style={{ animationDuration: '6s' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#1db954]">Spotify Integration</span>
              {isSdkConnected && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3" /> Connected
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300">
              {isSdkConnected
                ? 'Spotify Web Playback active for your account'
                : 'Direct playback requires Spotify Premium Web SDK connection'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1db954] hover:bg-[#1aa34a] text-black text-xs font-semibold rounded-lg shadow transition-all hover:scale-105"
          >
            <span>Open in App</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => setShowTokenModal(true)}
            className="flex items-center gap-1 px-2 py-1.5 bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium rounded-lg border border-white/10 transition-colors"
            title="Connect Spotify Access Token"
          >
            <Key className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Spotify Premium Auth Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#12141e] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-[#1db954]">Spotify</span> Web Playback SDK
            </h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Spotify requires OAuth access with a Spotify Premium account to stream protected audio in external web browsers. Enter a user access token from the Spotify Developer Console to stream directly:
            </p>

            <div className="mt-4">
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Spotify OAuth Access Token
              </label>
              <textarea
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder="Bearer BQC... (paste token here)"
                className="w-full h-24 bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#1db954] font-mono resize-none"
              />
            </div>

            <div className="mt-4 flex items-center justify-between">
              {spotifyToken ? (
                <button
                  onClick={handleClearToken}
                  className="text-xs text-red-400 hover:text-red-300 font-medium"
                >
                  Disconnect Token
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTokenModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveToken}
                  className="px-4 py-1.5 text-xs font-semibold bg-[#1db954] hover:bg-[#1aa34a] text-black rounded-lg transition-colors"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
