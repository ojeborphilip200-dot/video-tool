"use client";

import { useProject } from "../store";

export default function AudioPanel() {
  const { state, dispatch } = useProject();
  const label = { fontSize: "11px", color: "var(--ed-text-2)", margin: "14px 0 6px" } as const;

  return (
    <div style={{ padding: "14px" }}>
      <h3 style={{ fontSize: "13px", margin: 0 }}>Audio</h3>

      <p style={label}>Voiceover</p>
      {state.audioFile ? (
        <p style={{ fontSize: "11px", color: "#4ade80" }}>✓ {state.audioFile.name}</p>
      ) : (
        <p style={{ fontSize: "11px", color: "var(--ed-text-3)" }}>Upload in the AI tab (it also transcribes there).</p>
      )}

      <p style={label}>Background music</p>
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => dispatch({ type: "SET_MUSIC", file: e.target.files?.[0] || null })}
        style={{ fontSize: "11px", width: "100%" }}
      />
      {state.musicFile && <p style={{ fontSize: "11px", color: "#4ade80", marginTop: "6px" }}>✓ {state.musicFile.name}</p>}
      <p style={{ fontSize: "10px", color: "var(--ed-text-3)", marginTop: "10px", lineHeight: 1.5 }}>
        Music auto-ducks under narration during render (sidechain compression) — no manual volume needed.
      </p>

      <p style={label}>Sound effects</p>
      {([
        { key: "sfxShutter" as const, name: "Camera shutter", tip: "Clicks when a background frame snaps in" },
        { key: "sfxCountup" as const, name: "Number roll", tip: "Soft ticking under count-up animations" },
      ]).map((fx) => (
        <label key={fx.key} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "8px", fontSize: "12px", color: "var(--ed-text-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={state.settings[fx.key]}
            onChange={(e) => dispatch({ type: "SET_SETTING", key: fx.key, value: e.target.checked })}
            style={{ marginTop: "2px" }}
          />
          <span>
            {fx.name}
            <span style={{ display: "block", fontSize: "10px", color: "var(--ed-text-3)" }}>{fx.tip}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
