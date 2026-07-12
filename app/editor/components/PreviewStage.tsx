"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../store";
import { deriveTimeline, deriveCaptionChunks } from "../timeline";

export default function PreviewStage() {
  const { state } = useProject();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [portrait, setPortrait] = useState<Record<string, boolean>>({});

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
        border: "1px solid var(--ed-border)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!active && (
        <span style={{ fontSize: "12px", color: "var(--ed-text-3)" }}>
          {clips.length === 0 ? "Select clips in the Media tab to preview" : ""}
        </span>
      )}

      {active && active.gap && (
        <span style={{ fontSize: "12px", color: "var(--ed-text-3)", fontFamily: "var(--font-mono)" }}>EMPTY SLOT</span>
      )}

      {active && !active.gap && active.previewUrl.startsWith("map:") && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "22px" }}>🗺</span>
          <span style={{ fontSize: "11px", color: "var(--ed-text-3)" }}>Map animation — renders in the final export (live preview coming)</span>
        </div>
      )}

      {active && !active.gap && !active.previewUrl.startsWith("map:") && active.kind === "video" && (
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
        <img
          src={active.previewUrl}
          alt=""
          onLoad={(e) => {
            const el = e.currentTarget;
            const isPortrait = el.naturalHeight > el.naturalWidth;
            setPortrait((p) => (p[active.id] === isPortrait ? p : { ...p, [active.id]: isPortrait }));
          }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: portrait[active.id] ? "contain" : "cover",
            background: portrait[active.id] ? "#fff" : "transparent",
          }}
        />
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
