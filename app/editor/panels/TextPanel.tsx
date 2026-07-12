"use client";

import { useProject } from "../store";

const THEMES = [
  { id: "standard", label: "Standard", desc: "Clean & versatile", font: "Arial, sans-serif", weight: 700 },
  { id: "crime", label: "Crime", desc: "Bold & investigative", font: "'Arial Narrow', sans-serif", weight: 700 },
  { id: "history", label: "History", desc: "Classic & archival", font: "Georgia, serif", weight: 700 },
  { id: "modern", label: "Modern", desc: "Vibrant & kinetic", font: "'Helvetica Neue', sans-serif", weight: 700 },
  { id: "minimalist", label: "Minimalist", desc: "Subtle & spacious", font: "'Helvetica Neue', sans-serif", weight: 300 },
];

export default function TextPanel() {
  const { state, dispatch } = useProject();

  return (
    <div style={{ padding: "14px" }}>
      <h3 style={{ fontSize: "13px", margin: "0 0 10px" }}>Text</h3>

      {THEMES.map((t) => (
        <div
          key={t.id}
          onClick={() => dispatch({ type: "SET_SETTING", key: "textStyle", value: t.id })}
          style={{
            cursor: "pointer",
            padding: "10px 12px",
            borderRadius: "8px",
            marginBottom: "6px",
            border: state.settings.textStyle === t.id ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
          }}
        >
          <div style={{ fontSize: "14px", fontFamily: t.font, fontWeight: t.weight }}>{t.label}</div>
          <div style={{ fontSize: "10px", color: "#5c5f68", marginTop: "2px" }}>{t.desc}</div>
        </div>
      ))}

      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "12px", color: "#9295a0" }}>
        <input
          type="checkbox"
          checked={state.settings.calloutsEnabled}
          onChange={(e) => dispatch({ type: "SET_SETTING", key: "calloutsEnabled", value: e.target.checked })}
        />
        Text graphics (years, locations)
      </label>
    </div>
  );
}
