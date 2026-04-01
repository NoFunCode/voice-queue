import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type LocalAudioTrack, type RemoteAudioTrack } from 'livekit-client';

export type AudioWavMode = 'idle' | 'speaking' | 'listening';

interface AudioWavProps {
  state?: string;
  audioTrack?:
    | LocalAudioTrack
    | RemoteAudioTrack
    | {
        track?: LocalAudioTrack | RemoteAudioTrack;
        publication?: { track?: LocalAudioTrack | RemoteAudioTrack };
      };
  mode?: AudioWavMode;
  level?: number;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function stateToMode(state?: string): AudioWavMode {
  switch (state) {
    case 'speaking':
      return 'speaking';
    case 'listening':
    case 'thinking':
      return 'listening';
    default:
      return 'idle';
  }
}

function resolveTrack(
  audioTrack:
    | LocalAudioTrack
    | RemoteAudioTrack
    | {
        track?: LocalAudioTrack | RemoteAudioTrack;
        publication?: { track?: LocalAudioTrack | RemoteAudioTrack };
      }
    | undefined
): LocalAudioTrack | RemoteAudioTrack | undefined {
  if (!audioTrack) return undefined;
  if ('mediaStreamTrack' in audioTrack) return audioTrack;
  if (audioTrack.track) return audioTrack.track;
  if (audioTrack.publication?.track) return audioTrack.publication.track;
  return undefined;
}

export const AudioWav: React.FC<AudioWavProps> = ({
  state,
  audioTrack,
  mode = 'idle',
  level = 0,
  width = 72,
  height = 24,
  color = '#1FD5F9',
  className,
}) => {
  const [phase, setPhase] = useState(0);
  const [trackLevel, setTrackLevel] = useState(0);
  const frameRef = useRef<number | null>(null);
  const meterRef = useRef<number | null>(null);
  const filterIdRef = useRef(`audio-wav-glow-${Math.random().toString(36).slice(2, 9)}`);

  const resolvedMode = mode === 'idle' && state ? stateToMode(state) : mode;
  const resolvedTrack = useMemo(() => resolveTrack(audioTrack), [audioTrack]);
  const resolvedLevel = resolvedTrack ? trackLevel : level;

  useEffect(() => {
    const speed = resolvedMode === 'speaking' ? 0.22 : resolvedMode === 'listening' ? 0.18 : 0.08;
    const animate = () => {
      setPhase((prev) => prev + speed);
      frameRef.current = window.requestAnimationFrame(animate);
    };
    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [resolvedMode]);

  useEffect(() => {
    if (!resolvedTrack?.mediaStreamTrack) {
      setTrackLevel(0);
      return;
    }

    const context = new AudioContext();
    const stream = new MediaStream([resolvedTrack.mediaStreamTrack]);
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const n = (data[i] - 128) / 128;
        sum += n * n;
      }
      const rms = Math.sqrt(sum / data.length);
      const boosted = clamp01(rms * 4);
      setTrackLevel((prev) => prev * 0.45 + boosted * 0.55);
      meterRef.current = window.requestAnimationFrame(tick);
    };
    meterRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (meterRef.current !== null) {
        window.cancelAnimationFrame(meterRef.current);
        meterRef.current = null;
      }
      context.close().catch(() => undefined);
    };
  }, [resolvedTrack]);

  const path = useMemo(() => {
    const pointCount = 48;
    const centerY = height / 2;
    const normalizedLevel = clamp01(resolvedLevel);

    const baseAmplitude =
      resolvedMode === 'speaking'
        ? height * 0.34
        : resolvedMode === 'listening'
          ? height * 0.27
          : height * 0.1;
    const levelAmplitude = normalizedLevel * height * 0.34;
    const amplitude = baseAmplitude + levelAmplitude;
    const frequency = resolvedMode === 'speaking' ? 2.6 : resolvedMode === 'listening' ? 2.1 : 1.2;

    const points: string[] = [];
    for (let i = 0; i < pointCount; i++) {
      const t = i / (pointCount - 1);
      const x = t * width;
      const edgeFalloff = Math.pow(Math.sin(t * Math.PI), 0.55);
      const harmonicA = Math.sin(t * Math.PI * frequency + phase);
      const harmonicB = Math.sin(t * Math.PI * (frequency * 1.9) - phase * 0.7) * 0.35;
      const y = centerY + (harmonicA + harmonicB) * amplitude * edgeFalloff;
      points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return `M ${points.join(' L ')}`;
  }, [height, phase, resolvedLevel, resolvedMode, width]);

  const strokeOpacity = resolvedMode === 'idle' ? 0.45 : 1;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d={path}
        stroke={color}
        strokeOpacity={strokeOpacity}
        strokeWidth={2}
        strokeLinecap="round"
        filter={`url(#${filterIdRef.current})`}
      />
      <defs>
        <filter id={filterIdRef.current} x="-20%" y="-120%" width="140%" height="340%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
};

export default AudioWav;
