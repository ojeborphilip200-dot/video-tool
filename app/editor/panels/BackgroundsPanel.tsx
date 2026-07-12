"use client";

import { useProject } from "../store";

const PRESETS = [
  { id: "none", label: "None", bg: "var(--ed-bg-2)" },
  { id: "black", label: "Pure Black", bg: "#000" },
  { id: "grid", label: "Dark Grid", bg: "repeating-linear-gradient(0deg,var(--ed-bg-0),var(--ed-bg-0) 9px,var(--ed-bg-3) 10px),repeating-linear-gradient(90deg,var(--ed-bg-0),var(--ed-bg-0) 9px,var(--ed-bg-3) 10px)" },
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
                border: state.settings.background === p.id ? "2px solid var(--ed-accent)" : "1px solid var(--ed-border)",
              }}
            />
            <div style={{ fontSize: "9px", color: "var(--ed-text-2)", marginTop: "3px" }}>{p.label}</div>
          </div>
        ))}
      </div>

      {state.settings.background !== "none" && (
        <>
          <p style={{ fontSize: "11px", color: "var(--ed-text-2)", margin: "12px 0 6px" }}>Appearances</p>
          {(["2-3", "3-5", "always"] as const).map((f) => (
            <div
              key={f}
              onClick={() => dispatch({ type: "SET_SETTING", key: "bgFrequency", value: f })}
              style={{
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "8px",
                marginBottom: "6px",
                border: state.settings.bgFrequency === f ? "2px solid var(--ed-accent)" : "1px solid var(--ed-border)",
                background: "var(--ed-bg-2)",
              }}
            >
              <div style={{ fontSize: "12px" }}>{f === "always" ? "Throughout" : `${f} times`}</div>
              <div style={{ fontSize: "10px", color: "var(--ed-text-3)" }}>
                {f === "2-3" ? "Good for 8-15 min videos" : f === "3-5" ? "Good for 30 min+ videos" : "Frames the entire video"}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
