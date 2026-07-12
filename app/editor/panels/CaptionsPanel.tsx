"use client";

import { useProject } from "../store";

export default function CaptionsPanel() {
  const { state, dispatch } = useProject();

  return (
    <div style={{ padding: "14px" }}>
      <h3 style={{ fontSize: "13px", margin: "0 0 10px" }}>Captions</h3>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--ed-text-2)" }}>
        <input
          type="checkbox"
          checked={state.settings.captionsEnabled}
          onChange={(e) => dispatch({ type: "SET_SETTING", key: "captionsEnabled", value: e.target.checked })}
        />
        Burn word-synced captions into the video
      </label>
      <p style={{ fontSize: "10px", color: "var(--ed-text-3)", marginTop: "10px", lineHeight: 1.5 }}>
        Captions use the theme selected in the Text tab and sync to your voiceover's word timestamps.
      </p>
    </div>
  );
}
