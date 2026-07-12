"use client";

import { useProject } from "../store";

const PRESETS = [
  { id: "none", label: "None", bg: "#17181c" },
  { id: "black", label: "Pure Black", bg: "#000" },
  { id: "grid", label: "Dark Grid", bg: "repeating-linear-gradient(0deg,#0d0e12,#0d0e12 9px,#2a2c32 10px),repeating-linear-gradient(90deg,#0d0e12,#0d0e12 9px,#2a2c32 10px)" },
  { id: "blue-gradient", label: "Blue", bg: "linear-gradient(#1a2c5b,#05070d)" },
  { id: "green-gradient", label: "Green", bg: "linear-gradient(#14532d,#04100a)" },
  { id: "vintage", label: "Vintage", bg: "linear-gradient(#e8dfc8,#c9bfa5)" },
];

export default function BackgroundsPanel() {
  const { state, dispatch } = useProject();

  return (
    <div style={{ padding: "14px" }}>
      <h3 style={{ fontSize: "13px", margin: "0 0 10px" }}>Backgrounds</h3>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        {PRESETS.map((p) => (
          <div key={p.id} onClick={() => dispatch({ type: "SET_SETTING", key: "background", value: p.id })} style={{ cursor: "pointer", textAlign: "center" }}>
            <div
              style={{
                aspectRatio: "16 / 10",
                borderRadius: "6px",
                background: p.bg,
                border: state.settings.background === p.id ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
              }}
            />
            <div style={{ fontSize: "9px", color: "#9295a0", marginTop: "3px" }}>{p.label}</div>
          </div>
        ))}
      </div>

      {state.settings.background !== "none" && (
        <>
          <p style={{ fontSize: "11px", color: "#9295a0", margin: "12px 0 6px" }}>Appearances</p>
          {(["2-3", "3-5", "always"] as const).map((f) => (
            <div
              key={f}
              onClick={() => dispatch({ type: "SET_SETTING", key: "bgFrequency", value: f })}
              style={{
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "8px",
                marginBottom: "6px",
                border: state.settings.bgFrequency === f ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                background: "var(--bg-elevated)",
              }}
            >
              <div style={{ fontSize: "12px" }}>{f === "always" ? "Throughout" : `${f} times`}</div>
              <div style={{ fontSize: "10px", color: "#5c5f68" }}>
                {f === "2-3" ? "Good for 8-15 min videos" : f === "3-5" ? "Good for 30 min+ videos" : "Frames the entire video"}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
