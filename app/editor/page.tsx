"use client";

import { useEffect, useState } from "react";
import { ProjectProvider, useProject } from "./store";
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
      <h3 style={{ fontSize: "13px", color: "var(--ed-text-1)", margin: "0 0 8px" }}>{title}</h3>
      <p style={{ fontSize: "12px", color: "var(--ed-text-3)", lineHeight: 1.5 }}>{note}</p>
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
  const [dockH, setDockH] = useState(230);
  const [panelW, setPanelW] = useState(280);
  const [inspW, setInspW] = useState(260);

  function startDrag(
    e: React.MouseEvent,
    onMove: (dx: number, dy: number) => void
  ) {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: MouseEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const { status, exportVideo, canExport, clearResult } = useExport();
  const { state, dispatch, canUndo, canRedo } = useProject();

  // Selecting a clip on the timeline reveals it in the Media panel
  useEffect(() => {
    if (state.selected?.type === "clip") setNav("media");
  }, [state.selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA";
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      if (typing && el.tagName === "TEXTAREA" && !e.shiftKey) return; // let the textarea undo its own text
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "REDO" : "UNDO" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

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
      className="ed-root"
      style={{
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        ["--ed-dock-h" as any]: `${dockH}px`,
        display: "grid",
        gridTemplateRows: `48px 1fr ${dockH}px`,
        gridTemplateColumns: `56px ${panelW}px 1fr ${inspW}px`,
        gridTemplateAreas: `
          "top top top top"
          "rail panel stage inspector"
          "dock dock dock dock"
        `,
        background: "var(--ed-bg-0)",
        color: "var(--ed-text-1)",
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
          borderBottom: "1px solid var(--ed-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: 700, fontSize: "14px" }}>My Video Tool</span>
          <span style={{ fontSize: "11px", color: "var(--ed-text-3)" }}>Untitled project</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            className="btn btn-secondary"
            onClick={() => dispatch({ type: "UNDO" })}
            disabled={!canUndo}
            title="Undo (Cmd+Z)"
            style={{ padding: "4px 10px" }}
          >
            ↶
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => dispatch({ type: "REDO" })}
            disabled={!canRedo}
            title="Redo (Cmd+Shift+Z)"
            style={{ padding: "4px 10px" }}
          >
            ↷
          </button>
          {status.rendering && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "120px", height: "5px", background: "var(--ed-bg-3)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${status.progress}%`, background: "var(--ed-accent)", transition: "width 0.4s" }} />
              </div>
              <span style={{ fontSize: "11px", color: "var(--ed-text-2)" }}>{status.message}</span>
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
          borderRight: "1px solid var(--ed-border)",
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
              color: nav === n.id ? "#4f7cff" : "var(--ed-text-2)",
              fontSize: "14px",
            }}
          >
            <span>{n.icon}</span>
            <span style={{ fontSize: "8px", marginTop: "2px" }}>{n.label}</span>
          </div>
        ))}
      </div>

      {/* Contextual left panel */}
      <div style={{ gridArea: "panel", borderRight: "1px solid var(--ed-border)", overflowY: "auto" }}>
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
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {status.videoUrl ? (
          <div style={{ width: "100%", maxWidth: "820px" }}>
            <video id="rendered-video" src={status.videoUrl} controls autoPlay style={{ width: "100%", maxHeight: "calc(100vh - 420px)", borderRadius: "8px", background: "#000" }} />
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
      <div style={{ gridArea: "inspector", borderLeft: "1px solid var(--ed-border)", overflowY: "auto" }}>
        <Inspector />
      </div>

      {/* Timeline dock */}
      <div style={{ gridArea: "dock", borderTop: "1px solid var(--ed-border)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <TimelineDock />
      </div>

      {/* Drag handles: resize the dock, left panel, and inspector */}
      <div
        onMouseDown={(e) => {
          const h0 = dockH;
          startDrag(e, (_dx, dy) => setDockH(clamp(h0 - dy, 140, 520)));
        }}
        title="Drag to resize the timeline"
        style={{ position: "absolute", left: 0, right: 0, bottom: `${dockH - 3}px`, height: "7px", cursor: "row-resize", zIndex: 30 }}
      />
      <div
        onMouseDown={(e) => {
          const w0 = panelW;
          startDrag(e, (dx) => setPanelW(clamp(w0 + dx, 200, 500)));
        }}
        title="Drag to resize the panel"
        style={{ position: "absolute", top: "48px", bottom: `${dockH}px`, left: `${56 + panelW - 3}px`, width: "7px", cursor: "col-resize", zIndex: 30 }}
      />
      <div
        onMouseDown={(e) => {
          const w0 = inspW;
          startDrag(e, (dx) => setInspW(clamp(w0 - dx, 180, 440)));
        }}
        title="Drag to resize the inspector"
        style={{ position: "absolute", top: "48px", bottom: `${dockH}px`, right: `${inspW - 3}px`, width: "7px", cursor: "col-resize", zIndex: 30 }}
      />
    </div>
  );
}
