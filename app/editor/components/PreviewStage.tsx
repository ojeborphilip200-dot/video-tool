"use client";

import { useEffect, useMemo, useRef } from "react";
import { useProject } from "../store";
import { deriveTimeline, deriveCaptionChunks } from "../timeline";

export default function PreviewStage() {
  const { state } = useProject();
  const videoRef = useRef<HTMLVideoElement>(null);

  const { clips, total } = useMemo(() => deriveTimeline(state.beats), [state.beats]);
  const chunks = useMemo(() => deriveCaptionChunks(state.words), [state.words]);

  const t = state.currentTime;
  const active = clips.find((c) => t >= c.start && t < c.end) || (t >= total && clips.length > 0 ? clips[clips.length - 1] : undefined);
  const caption = state.settings.captionsEnabled ? chunks.find((c) => t >= c.start && t <= c.end) : undefined;

  // Keep the video element synced to the master clock
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !active || active.gap || active.kind !== "video") return;
    const want = active.trimStart + Math.min(t - active.start, active.trimEnd - active.trimStart);
    if (Math.abs(el.currentTime - want) > 0.35) {
      el.currentTime = want;
    }
    if (state.playing) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active?.id, state.playing, t, active]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "820px",
        aspectRatio: "16 / 9",
        background: "#000",
        borderRadius: "8px",
        border: "1px solid var(--border-subtle, #2a2c32)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!active && (
        <span style={{ fontSize: "12px", color: "#5c5f68" }}>
          {clips.length === 0 ? "Select clips in the Media tab to preview" : ""}
        </span>
      )}

      {active && active.gap && (
        <span style={{ fontSize: "12px", color: "#3a3d45", fontFamily: "var(--font-mono)" }}>EMPTY SLOT</span>
      )}

      {active && !active.gap && active.kind === "video" && (
        <video
          key={active.id}
          ref={videoRef}
          src={active.previewUrl}
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}

      {active && !active.gap && active.kind === "image" && (
        <img src={active.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}

      {caption && (
        <div
          style={{
            position: "absolute",
            bottom: "6%",
            left: 0,
            right: 0,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "#fff",
              textShadow: "0 0 4px #000, 2px 2px 2px #000",
              padding: "0 20px",
            }}
          >
            {caption.text}
          </span>
        </div>
      )}

      <span style={{ position: "absolute", top: "6px", right: "8px", fontSize: "9px", color: "rgba(255,255,255,0.4)" }}>
        preview approximation · final render adds motion, themes & effects
      </span>
    </div>
  );
}
