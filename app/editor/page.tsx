"use client";

import { useState } from "react";
import { ProjectProvider } from "./store";
import AIPanel from "./panels/AIPanel";
import MediaPanel from "./panels/MediaPanel";
import AudioPanel from "./panels/AudioPanel";
import TextPanel from "./panels/TextPanel";
import CaptionsPanel from "./panels/CaptionsPanel";
import EffectsPanel from "./panels/EffectsPanel";
import BackgroundsPanel from "./panels/BackgroundsPanel";
import PreviewStage from "./components/PreviewStage";
import TimelineDock from "./components/TimelineDock";
import Inspector from "./components/Inspector";
import { useExport } from "./useExport";

const NAV = [
  { id: "ai", icon: "✦", label: "AI" },
  { id: "media", icon: "▣", label: "Media" },
  { id: "audio", icon: "♪", label: "Audio" },
  { id: "text", icon: "T", label: "Text" },
  { id: "captions", icon: "cc", label: "Captions" },
  { id: "effects", icon: "★", label: "Effects" },
  { id: "backgrounds", icon: "▦", label: "Backgrounds" },
] as const;

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ padding: "16px" }}>
      <h3 style={{ fontSize: "13px", color: "#eceef1", margin: "0 0 8px" }}>{title}</h3>
      <p style={{ fontSize: "12px", color: "#5c5f68", lineHeight: 1.5 }}>{note}</p>
    </div>
  );
}

export default function EditorPage() {
  return (
    <ProjectProvider>
      <Editor />
    </ProjectProvider>
  );
}

function Editor() {
  const [nav, setNav] = useState<string>("ai");
  const { status, exportVideo, canExport, clearResult } = useExport();

  const panels: Record<string, { title: string; note: string }> = {
    ai: { title: "AI", note: "Script, transcription, Generate Beats, media preference and Auto 2-img connect here in Phase 4." },
    media: { title: "Media", note: "Per-beat galleries, Regenerate, and the large preview connect here in Phase 4." },
    audio: { title: "Audio", note: "Voiceover and background music uploads connect here in Phase 4." },
    text: { title: "Text", note: "The five text & graphics themes and the text-graphics toggle connect here in Phase 4." },
    captions: { title: "Captions", note: "The captions toggle connects here in Phase 4." },
    effects: { title: "Effects", note: "Number count-up levels connect here in Phase 4." },
    backgrounds: { title: "Backgrounds", note: "Background frame presets and frequency connect here in Phase 4." },
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateRows: "48px 1fr 230px",
        gridTemplateColumns: "56px 280px 1fr 260px",
        gridTemplateAreas: `
          "top top top top"
          "rail panel stage inspector"
          "dock dock dock dock"
        `,
        background: "#0d0e12",
        color: "#eceef1",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          gridArea: "top",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          borderBottom: "1px solid var(--border-subtle, #2a2c32)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: 700, fontSize: "14px" }}>My Video Tool</span>
          <span style={{ fontSize: "11px", color: "#5c5f68" }}>Untitled project</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {status.rendering && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "120px", height: "5px", background: "#2a2c32", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${status.progress}%`, background: "var(--accent-blue)", transition: "width 0.4s" }} />
              </div>
              <span style={{ fontSize: "11px", color: "#9295a0" }}>{status.message}</span>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={() => exportVideo()}
            disabled={!canExport}
            title={canExport ? "Render the final video" : "Add a voiceover and select clips first"}
          >
            {status.rendering ? "Rendering..." : "Export Video"}
          </button>
        </div>
      </div>

      {/* Icon rail */}
      <div
        style={{
          gridArea: "rail",
          borderRight: "1px solid var(--border-subtle, #2a2c32)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "10px",
          gap: "4px",
        }}
      >
        {NAV.map((n) => (
          <div
            key={n.id}
            onClick={() => setNav(n.id)}
            title={n.label}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: nav === n.id ? "rgba(79,124,255,0.15)" : "transparent",
              color: nav === n.id ? "#4f7cff" : "#9295a0",
              fontSize: "14px",
            }}
          >
            <span>{n.icon}</span>
            <span style={{ fontSize: "8px", marginTop: "2px" }}>{n.label}</span>
          </div>
        ))}
      </div>

      {/* Contextual left panel */}
      <div style={{ gridArea: "panel", borderRight: "1px solid var(--border-subtle, #2a2c32)", overflowY: "auto" }}>
        {nav === "ai" ? <AIPanel />
          : nav === "media" ? <MediaPanel />
          : nav === "audio" ? <AudioPanel />
          : nav === "text" ? <TextPanel />
          : nav === "captions" ? <CaptionsPanel />
          : nav === "effects" ? <EffectsPanel />
          : nav === "backgrounds" ? <BackgroundsPanel />
          : <Placeholder title={panels[nav].title} note={panels[nav].note} />}
      </div>

      {/* Preview stage */}
      <div
        style={{
          gridArea: "stage",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        {status.videoUrl ? (
          <div style={{ width: "100%", maxWidth: "820px" }}>
            <video src={status.videoUrl} controls autoPlay style={{ width: "100%", borderRadius: "8px", background: "#000" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
              <a href={status.videoUrl} download="final-video.mp4" className="btn btn-primary" style={{ textDecoration: "none" }}>
                Download MP4
              </a>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn btn-secondary"
                  disabled={status.rendering}
                  onClick={() => exportVideo(!status.renderedWithCaptions)}
                  title="Re-renders from cache - only the encode repeats"
                >
                  {status.renderedWithCaptions ? "Re-render without captions" : "Re-render with captions"}
                </button>
                <button className="btn btn-secondary" onClick={clearResult}>
                  Back to editing
                </button>
              </div>
            </div>
          </div>
        ) : (
          <PreviewStage />
        )}
      </div>

      {/* Inspector */}
      <div style={{ gridArea: "inspector", borderLeft: "1px solid var(--border-subtle, #2a2c32)", overflowY: "auto" }}>
        <Inspector />
      </div>

      {/* Timeline dock */}
      <div style={{ gridArea: "dock", borderTop: "1px solid var(--border-subtle, #2a2c32)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <TimelineDock />
      </div>
    </div>
  );
}
