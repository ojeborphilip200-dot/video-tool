"use client";

import { useProject } from "../store";

export default function AudioPanel() {
  const { state, dispatch } = useProject();
  const label = { fontSize: "11px", color: "#9295a0", margin: "14px 0 6px" } as const;

  return (
    <div style={{ padding: "14px" }}>
      <h3 style={{ fontSize: "13px", margin: 0 }}>Audio</h3>

      <p style={label}>Voiceover</p>
      {state.audioFile ? (
        <p style={{ fontSize: "11px", color: "#4ade80" }}>✓ {state.audioFile.name}</p>
      ) : (
        <p style={{ fontSize: "11px", color: "#5c5f68" }}>Upload in the AI tab (it also transcribes there).</p>
      )}

      <p style={label}>Background music</p>
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => dispatch({ type: "SET_MUSIC", file: e.target.files?.[0] || null })}
        style={{ fontSize: "11px", width: "100%" }}
      />
      {state.musicFile && <p style={{ fontSize: "11px", color: "#4ade80", marginTop: "6px" }}>✓ {state.musicFile.name}</p>}
      <p style={{ fontSize: "10px", color: "#5c5f68", marginTop: "10px", lineHeight: 1.5 }}>
        Music auto-ducks under narration during render (sidechain compression) — no manual volume needed.
      </p>
    </div>
  );
}
