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

const NAV = [
  { id: "ai", icon: "✦", label: "AI" },
  { id: "media", icon: "▣", label: "Media" },
  { id: "audio", icon: "♪", label: "Audio" },
  { id: "text", icon: "T", label: "Text" },
  { id: "captions", icon: "cc", label: "Captions" },
  { id: "effects", icon: "★", label: "Effects" },
  { id: "backgrounds", icon: "▦", label: "Backgrounds" },
] as const;

const TRACKS = ["SCRIPT", "VISUALS", "TEXT", "BACKGROUND", "CAPTIONS", "VOICE", "MUSIC"];

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
  const [zoom, setZoom] = useState(1);

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
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn btn-secondary" disabled title="Connects in a later phase">↶</button>
          <button className="btn btn-secondary" disabled title="Connects in a later phase">↷</button>
          <button className="btn btn-primary" disabled title="Connects in Phase 6">Export Video</button>
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
        <div
          style={{
            width: "100%",
            maxWidth: "820px",
            aspectRatio: "16 / 9",
            background: "#000",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border-subtle, #2a2c32)",
          }}
        >
          <span style={{ fontSize: "12px", color: "#5c5f68" }}>Preview connects in Phase 5</span>
        </div>
      </div>

      {/* Inspector */}
      <div style={{ gridArea: "inspector", borderLeft: "1px solid var(--border-subtle, #2a2c32)", overflowY: "auto" }}>
        <Placeholder
          title="Properties"
          note="Select a timeline item to edit it. Contextual inspectors (clip trim, image duration, text style) connect in Phase 4-5."
        />
      </div>

      {/* Timeline dock */}
      <div style={{ gridArea: "dock", borderTop: "1px solid var(--border-subtle, #2a2c32)", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            height: "36px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "0 14px",
            borderBottom: "1px solid var(--border-subtle, #2a2c32)",
          }}
        >
          <button className="btn btn-secondary" disabled title="Connects in Phase 5" style={{ padding: "4px 12px", fontSize: "12px" }}>
            ▶
          </button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#9295a0" }}>00:00.00 / 00:00.00</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", color: "#5c5f68" }}>Zoom</span>
            <input type="range" min={0.5} max={4} step={0.1} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {TRACKS.map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", height: "24px", padding: "0 8px", gap: "8px" }}>
              <span style={{ width: "86px", fontSize: "9px", color: "#5c5f68", fontFamily: "var(--font-mono)" }}>{t}</span>
              <div style={{ flex: 1, height: "18px", background: "#17181c", borderRadius: "4px" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
