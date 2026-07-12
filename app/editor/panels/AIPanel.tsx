"use client";

import { useState } from "react";
import { useProject, Beat } from "../store";

export default function AIPanel() {
  const { state, dispatch } = useProject();
  const [transcribing, setTranscribing] = useState(false);
  const [segmenting, setSegmenting] = useState(false);

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    dispatch({ type: "SET_AUDIO", file });
    setTranscribing(true);
    const formData = new FormData();
    formData.append("audio", file);
    const res = await fetch("/api/transcribe", { method: "POST", body: formData });
    const data = await res.json();
    setTranscribing(false);
    if (data.text) {
      dispatch({ type: "SET_SCRIPT", script: data.text });
      dispatch({ type: "SET_WORDS", words: data.words || [] });
    } else {
      alert("Error: " + (data.error || "Transcription failed"));
    }
  }

  function sentenceFallback(text: string): Beat[] {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ({
        text: s,
        keywords: [s.split(/\s+/).slice(0, 4).join(" ")],
        entities: [],
        queries: [],
        treatment: "video" as const,
        duration: Math.max(2, s.split(/\s+/).length / 2.5),
        start: 0,
        end: 0,
        selectedClips: [],
      }));
  }

  async function handleGenerateBeats() {
    setSegmenting(true);
    try {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: state.script, words: state.words }),
      });
      const data = await res.json();
      const beats: Beat[] =
        data.beats && data.beats.length > 0
          ? data.beats.map((b: any) => ({
              text: b.text,
              keywords: b.keywords || [],
              entities: b.entities || [],
              queries: b.queries || [],
              treatment: b.treatment || "video",
              duration: b.duration,
              start: b.start || 0,
              end: b.end || 0,
              selectedClips: [],
            }))
          : sentenceFallback(state.script);
      dispatch({ type: "SET_BEATS", beats });
    } catch {
      dispatch({ type: "SET_BEATS", beats: sentenceFallback(state.script) });
    }
    setSegmenting(false);
  }

  const label = { fontSize: "11px", color: "#9295a0", margin: "14px 0 6px" } as const;

  return (
    <div style={{ padding: "14px" }}>
      <h3 style={{ fontSize: "13px", margin: "0 0 4px" }}>AI</h3>

      <p style={label}>Voiceover (auto-transcribes)</p>
      <input type="file" accept="audio/*" onChange={handleAudioUpload} style={{ fontSize: "11px", width: "100%" }} />
      {transcribing && <p style={{ fontSize: "11px", color: "#5c5f68" }}>Transcribing...</p>}

      <p style={label}>Script</p>
      <textarea
        value={state.script}
        onChange={(e) => dispatch({ type: "SET_SCRIPT", script: e.target.value })}
        rows={9}
        style={{ width: "100%", fontSize: "12px", lineHeight: 1.5 }}
        placeholder="Paste your script or upload a voiceover..."
      />

      <button
        onClick={handleGenerateBeats}
        disabled={!state.script || segmenting}
        className="btn btn-primary"
        style={{ marginTop: "10px", width: "100%" }}
      >
        {segmenting ? "Analyzing script..." : "Generate beats"}
      </button>

      {state.beats.length > 0 && (
        <p style={{ fontSize: "11px", color: "#4ade80", marginTop: "8px" }}>
          {state.beats.length} beats ready — open the Media tab to source footage.
        </p>
      )}

      <p style={label}>Media preference</p>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {(["both", "video", "image"] as const).map((m) => (
          <div
            key={m}
            onClick={() => dispatch({ type: "SET_SETTING", key: "mediaPref", value: m })}
            style={{
              cursor: "pointer",
              padding: "4px 10px",
              borderRadius: "999px",
              fontSize: "11px",
              border: state.settings.mediaPref === m ? "1px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
              color: state.settings.mediaPref === m ? "#eceef1" : "#9295a0",
            }}
          >
            {m === "both" ? "Video + Images" : m === "video" ? "Video only" : "Images only"}
          </div>
        ))}
      </div>

      <div
        onClick={() => dispatch({ type: "SET_SETTING", key: "autoFill", value: !state.settings.autoFill })}
        style={{
          cursor: "pointer",
          marginTop: "8px",
          padding: "4px 10px",
          borderRadius: "999px",
          fontSize: "11px",
          display: "inline-block",
          border: state.settings.autoFill ? "1px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
          color: state.settings.autoFill ? "#eceef1" : "#9295a0",
        }}
      >
        Auto 2-img
      </div>
    </div>
  );
}
