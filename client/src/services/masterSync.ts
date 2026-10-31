/**
 * MasterSync - Phase-locked synchronization using Web Audio API
 * 
 * Provides sample-accurate timing by using AudioContext.currentTime
 * as the master clock, with phase-locked loop (PLL) drift correction.
 */

interface SyncConfig {
  /** Target drift threshold for hard seek (seconds) */
  hardSeekThreshold: number;
  /** Rate adjustment range for PLL */
  maxRateAdjustment: number;
  /** PLL bandwidth (how fast it locks) - lower = slower but more stable */
  pllBandwidth: number;
  /** Minimum interval between hard seeks (ms) */
  minSeekInterval: number;
}

const DEFAULT_CONFIG: SyncConfig = {
  hardSeekThreshold: 0.05,      // 50ms - hard seek if drift exceeds this
  maxRateAdjustment: 0.05,      // ±5% rate adjustment max
  pllBandwidth: 0.02,           // PLL loop bandwidth
  minSeekInterval: 2000,        // 2 seconds between hard seeks
};

interface PLLState {
  phaseError: number;           // Current phase error (seconds)
  frequencyError: number;       // Estimated frequency error (ppm)
  lastUpdate: number;           // Last update timestamp
  integral: number;             // Integral term for PI controller
}

export class MasterSync {
  private audioContext: AudioContext | null = null;
  private config: SyncConfig;
  private pll: PLLState = {
    phaseError: 0,
    frequencyError: 0,
    lastUpdate: 0,
    integral: 0,
  };
  private adapterLatency = 0;   // Measured adapter latency (seconds)
  private isPlaying = false;
  private scheduledStartTime = 0;
  private onSeekCallback?: (targetTime: number) => void;

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initAudioContext();
  }

  private initAudioContext(): void {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        this.audioContext = new AC();
        // Resume if suspended (autoplay policy)
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
      }
    } catch {
      // AudioContext not available, fall back to Date.now()
    }
  }

  /** Get current master time in seconds */
  getMasterTime(): number {
    if (this.audioContext && this.audioContext.state === 'running') {
      return this.audioContext.currentTime;
    }
    return Date.now() / 1000;
  }

  /** Get current master time in milliseconds */
  getMasterTimeMs(): number {
    return this.getMasterTime() * 1000;
  }

  /** Set adapter latency compensation (seconds) */
  setAdapterLatency(latency: number): void {
    this.adapterLatency = latency;
  }

  /** Register callback for seeking */
  setCallbacks(
    onSeek: (targetTime: number) => void
  ): void {
    this.onSeekCallback = onSeek;
  }

  /** Called when playback starts - captures the phase reference */
  onPlayStart(serverTargetTime: number): void {
    const masterTime = this.getMasterTime();
    this.isPlaying = true;
    this.scheduledStartTime = serverTargetTime;
    
    // Initialize PLL with current phase error
    this.pll = {
      phaseError: masterTime - serverTargetTime,
      frequencyError: 0,
      lastUpdate: masterTime,
      integral: 0,
    };
  }

  /** Called when playback pauses */
  onPause(): void {
    this.isPlaying = false;
  }

  /** Called when playback stops */
  onStop(): void {
    this.isPlaying = false;
    this.scheduledStartTime = 0;
  }

  /** Main PLL update - call at ~60fps or on each audio callback */
  update(currentAdapterTime: number): { rate: number; shouldSeek: boolean; seekTarget?: number } {
    if (!this.isPlaying) {
      return { rate: 1, shouldSeek: false };
    }

    const masterTime = this.getMasterTime();
    const targetTime = this.scheduledStartTime + (masterTime - this.pll.lastUpdate);
    
    // Calculate phase error (adapter time vs target time)
    const adjustedAdapterTime = currentAdapterTime + this.adapterLatency;
    const phaseError = adjustedAdapterTime - targetTime;
    
    const now = masterTime;
    const dt = now - this.pll.lastUpdate;
    this.pll.lastUpdate = now;

    // PI Controller for phase-locked loop
    // Proportional term
    const kp = this.config.pllBandwidth;
    // Integral term (accumulates frequency error)
    const ki = this.config.pllBandwidth * 0.1;
    
    this.pll.integral += phaseError * dt;
    // Clamp integral to prevent windup
    const maxIntegral = this.config.maxRateAdjustment / ki;
    this.pll.integral = Math.max(-maxIntegral, Math.min(maxIntegral, this.pll.integral));
    
    // Frequency error estimation (ppm)
    this.pll.frequencyError = kp * phaseError + ki * this.pll.integral;
    
    // Convert to rate adjustment (1.0 = normal speed)
    let rate = 1 + this.pll.frequencyError;
    
    // Clamp rate adjustment
    const maxAdj = this.config.maxRateAdjustment;
    rate = Math.max(1 - maxAdj, Math.min(1 + maxAdj, rate));
    
    // Check if we need a hard seek
    const shouldSeek = Math.abs(phaseError) > this.config.hardSeekThreshold;
    
    return {
      rate,
      shouldSeek,
      seekTarget: shouldSeek ? targetTime : undefined,
    };
  }

  /** Force a hard seek to server time */
  forceSeek(serverTime: number): void {
    this.pll.phaseError = this.getMasterTime() - serverTime;
    this.pll.integral = 0;
    this.pll.frequencyError = 0;
    if (this.onSeekCallback) {
      this.onSeekCallback(serverTime);
    }
  }

  /** Manually set phase error (for testing/calibration) */
  setPhaseError(error: number): void {
    this.pll.phaseError = error;
  }

  /** Get current drift in milliseconds */
  getDriftMs(): number {
    return Math.round(this.pll.phaseError * 1000);
  }

  /** Get current rate adjustment in ppm */
  getRatePpm(): number {
    return Math.round(this.pll.frequencyError * 1_000_000);
  }

  destroy(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

/** Factory for creating MasterSync with platform-specific config */
export function createMasterSync(): MasterSync {
  // iOS Safari has different AudioContext behavior
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  return new MasterSync({
    hardSeekThreshold: isIOS ? 0.1 : 0.05,  // iOS more tolerant
    maxRateAdjustment: isIOS ? 0.08 : 0.05, // iOS needs wider range
    pllBandwidth: isIOS ? 0.015 : 0.02,
    minSeekInterval: isIOS ? 3000 : 2000,
  });
}