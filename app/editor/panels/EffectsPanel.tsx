"use client";

import { useProject } from "../store";

const LEVELS = [
  { id: "off", label: "Off", tip: "Never" },
  { id: "low", label: "Low", tip: "~1 per 2-3 min" },
  { id: "medium", label: "Medium", tip: "~1 per 60-90s" },
  { id: "high", label: "High", tip: "Key stats" },
] as const;

export default function EffectsPanel() {
  const { state, dispatch } = useProject();

  return (
    <div style={{ padding: "14px" }}>
      <h3 style={{ fontSize: "13px", margin: "0 0 4px" }}>Effects</h3>
      <p style={{ fontSize: "11px", color: "#9295a0", margin: "0 0 10px" }}>Number count-up overlays</p>

      {LEVELS.map((o) => (
        <div
          key={o.id}
          onClick={() => dispatch({ type: "SET_SETTING", key: "countupLevel", value: o.id })}
          style={{
            cursor: "pointer",
            padding: "8px 12px",
            borderRadius: "8px",
            marginBottom: "6px",
            border: state.settings.countupLevel === o.id ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
          }}
        >
          <div style={{ fontSize: "12px" }}>{o.label}</div>
          <div style={{ fontSize: "10px", color: "#5c5f68" }}>{o.tip}</div>
        </div>
      ))}
    </div>
  );
}
