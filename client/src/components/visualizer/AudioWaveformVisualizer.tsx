import React, { useEffect, useRef } from 'react';

interface AudioWaveformVisualizerProps {
  isPlaying?: boolean;
  accentColor?: string;
  className?: string;
  barCount?: number;
}

export const AudioWaveformVisualizer: React.FC<AudioWaveformVisualizerProps> = ({
  isPlaying = true,
  accentColor = '#8b5cf6',
  className = '',
  barCount = 36
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const barWidth = width / barCount;
      const gap = Math.max(2, barWidth * 0.25);
      const effectiveBarWidth = barWidth - gap;

      if (isPlaying) {
        phase += 0.05;
      }

      for (let i = 0; i < barCount; i++) {
        // Compute procedural dynamic waveform height based on phase and index
        const normalized = i / barCount;
        let amplitude = 0.15;

        if (isPlaying) {
          const wave1 = Math.sin(phase * 1.5 + normalized * Math.PI * 4);
          const wave2 = Math.cos(phase * 2.2 + normalized * Math.PI * 2);
          const wave3 = Math.sin(phase * 0.8 + normalized * Math.PI * 6);
          amplitude = Math.max(0.1, (wave1 * 0.35 + wave2 * 0.25 + wave3 * 0.2 + 0.6) * 0.85);
        }

        const barHeight = height * amplitude;
        const x = i * barWidth + gap / 2;
        const y = (height - barHeight) / 2;

        // Gradient color: transition from cyan (#06b6d4) to purple (#8b5cf6) to pink (#ec4899)
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#06b6d4');
        gradient.addColorStop(0.5, accentColor);
        gradient.addColorStop(1, '#ec4899');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, effectiveBarWidth, barHeight, [3, 3, 3, 3]);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, accentColor, barCount]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={80}
      className={`w-full h-full pointer-events-none ${className}`}
    />
  );
};
