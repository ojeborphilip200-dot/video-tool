"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

type BeatMarker = {
  start: number;
  end: number;
  label: string;
};

type VoiceoverWaveformProps = {
  audioFile: File;
  beatMarkers: BeatMarker[];
};

export default function VoiceoverWaveform({ audioFile, beatMarkers }: VoiceoverWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#3a3d45",
      progressColor: "#4f7cff",
      cursorColor: "#ff8a65",
      cursorWidth: 2,
      height: 64,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
    });

    ws.loadBlob(audioFile);

    ws.on("ready", () => setDuration(ws.getDuration()));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("timeupdate", (t) => setCurrentTime(t));

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [audioFile]);

  function togglePlay() {
    wavesurferRef.current?.playPause();
  }

  function fmt(t: number): string {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
        <button onClick={togglePlay} className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "13px" }}>
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#9295a0" }}>
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <span style={{ fontSize: "12px", color: "#5c5f68" }}>
          Voiceover · click waveform to seek
        </span>
      </div>

      <div ref={containerRef} />

      {duration > 0 && beatMarkers.length > 0 && (
        <div style={{ position: "relative", height: "18px", marginTop: "4px" }}>
          {beatMarkers.map((b, i) => (
            <div
              key={i}
              title={b.label}
              style={{
                position: "absolute",
                left: `${(b.start / duration) * 100}%`,
                width: `${(Math.max(b.end - b.start, 0.1) / duration) * 100}%`,
                top: 0,
                bottom: 0,
                background: i % 2 === 0 ? "rgba(255,138,101,0.25)" : "rgba(79,124,255,0.25)",
                borderRadius: "3px",
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                color: "#9295a0",
                paddingLeft: "4px",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {b.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}