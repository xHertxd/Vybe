export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  if (clean.length <= 2) return clean.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export function providerLabel(provider: string): string {
  if (provider === 'youtube') return 'YouTube';
  if (provider === 'spotify') return 'Spotify';
  return 'Audio';
}

export function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const formatDuration = formatTime;
