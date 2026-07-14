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
      <p style={{ fontSize: "11px", color: "var(--ed-text-2)", margin: "0 0 10px" }}>Number count-up overlays</p>

      {LEVELS.map((o) => (
        <div
          key={o.id}
          onClick={() => dispatch({ type: "SET_SETTING", key: "countupLevel", value: o.id })}
          style={{
            cursor: "pointer",
            padding: "8px 12px",
            borderRadius: "8px",
            marginBottom: "6px",
            border: state.settings.countupLevel === o.id ? "2px solid var(--ed-accent)" : "1px solid var(--ed-border)",
            background: "var(--ed-bg-2)",
          }}
        >
          <div style={{ fontSize: "12px" }}>{o.label}</div>
          <div style={{ fontSize: "10px", color: "var(--ed-text-3)" }}>{o.tip}</div>
        </div>
      ))}

      <div style={{ borderTop: "1px solid var(--ed-border)", margin: "16px 0 12px" }} />
      <p style={{ fontSize: "11px", color: "var(--ed-text-2)", margin: "0 0 8px" }}>
        Text animations
        <span style={{ color: "var(--ed-text-3)" }}>
          {" "}— generated from your script. Delete any you don't want.
        </span>
      </p>

      {(() => {
        const te = state.textEvents;
        const items = te
          ? [
              ...te.callouts.map((c) => ({
                id: c.id,
                label: c.text,
                sub: "callout",
                at: c.start,
              })),
              ...te.countups.map((c) => ({
                id: c.id,
                label: `${c.prefix}${c.value}${c.suffix}`,
                sub: "count-up",
                at: c.animStart,
              })),
            ].sort((a, b) => a.at - b.at)
          : [];

        if (!te) {
          return (
            <p style={{ fontSize: "10px", color: "var(--ed-text-3)" }}>
              Generate scenes to detect text animations.
            </p>
          );
        }
        if (items.length === 0) {
          return (
            <p style={{ fontSize: "10px", color: "var(--ed-text-3)" }}>
              No text animations detected.
            </p>
          );
        }
        return items.map((it) => (
          <div
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 10px",
              marginBottom: "6px",
              borderRadius: "8px",
              border: "1px solid var(--ed-border)",
              background: "var(--ed-bg-2)",
            }}
          >
            <div
              onClick={() => {
                dispatch({ type: "SET_PLAYING", playing: false });
                dispatch({ type: "SET_TIME", t: Math.max(0, it.at - 0.2) });
              }}
              style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
              title="Jump to this moment"
            >
              <div style={{ fontSize: "12px", color: "var(--ed-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.label}
              </div>
              <div style={{ fontSize: "9px", color: "var(--ed-text-3)" }}>
                {it.sub} · {it.at.toFixed(1)}s
              </div>
            </div>
            <button
              onClick={() => dispatch({ type: "REMOVE_TEXT_EVENT", eventId: it.id })}
              title="Delete this animation"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--ed-text-3)",
                cursor: "pointer",
                fontSize: "15px",
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              ×
            </button>
          </div>
        ));
      })()}
    </div>
  );
}
