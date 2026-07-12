"use client";

import { useState } from "react";
import { useProject, Beat, MediaItem } from "../store";

function usedTime(b: Beat) {
  return b.selectedClips.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0);
}
function remainingTime(b: Beat) {
  return Math.max(0, b.duration - usedTime(b));
}

export default function MediaPanel() {
  const { state, dispatch } = useProject();
  const [preview, setPreview] = useState<{ beatIndex: number; media: MediaItem } | null>(null);

  async function findMedia(index: number, regenerate = false) {
    const beat = state.beats[index];
    const page = regenerate ? (beat.mediaPage || 1) + 1 : beat.mediaPage || 1;

    const excludeIds = [
      ...new Set(
        state.beats.flatMap((b, bi) => {
          const own = bi === index;
          if (own && !regenerate) return b.selectedClips.map((c) => c.media.id);
          const gallery = [...(b.videos || []).map((m) => m.id), ...(b.images || []).map((m) => m.id)];
          return own ? gallery : [...gallery, ...b.selectedClips.map((c) => c.media.id)];
        })
      ),
    ];

    dispatch({ type: "PATCH_BEAT", index, patch: { loadingMedia: true } });

    try {
      const res = await fetch("/api/footage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: beat.keywords.join(" ") || beat.text,
          queries: beat.queries || [],
          entities: beat.entities || [],
          beatText: beat.text,
          keywords: beat.keywords,
          page,
          excludeIds,
          mediaType: state.settings.mediaPref,
        }),
      });
      const data = await res.json();
      const videos: MediaItem[] = data.videos || [];
      const images: MediaItem[] = data.images || [];

      let selectedClips = regenerate ? [] : beat.selectedClips;
      if (selectedClips.length === 0) {
        const vPool = state.settings.mediaPref === "image" ? [] : videos;
        const iPool = state.settings.mediaPref === "video" ? [] : images;
        if (state.settings.autoFill && iPool.length >= 2 && beat.duration >= 6) {
          const per = beat.duration / 2;
          selectedClips = iPool.slice(0, 2).map((m) => ({ media: m, trimStart: 0, trimEnd: per }));
        } else {
          const pick = beat.treatment === "image" ? iPool[0] || vPool[0] : vPool[0] || iPool[0];
          if (pick) {
            const trimEnd = pick.kind === "image" ? beat.duration : Math.min(pick.duration, beat.duration);
            selectedClips = [{ media: pick, trimStart: 0, trimEnd }];
          }
        }
      }

      dispatch({
        type: "PATCH_BEAT",
        index,
        patch: { videos, images, loadingMedia: false, mediaPage: page, selectedClips },
      });
      if (data.error) alert("Error: " + data.error);
    } catch {
      dispatch({ type: "PATCH_BEAT", index, patch: { loadingMedia: false } });
    }
  }

  async function findAll() {
    for (let i = 0; i < state.beats.length; i++) {
      await findMedia(i);
    }
  }

  function toggleSelect(index: number, media: MediaItem) {
    const beat = state.beats[index];

    // If an empty slot in this beat is selected, drop the clip straight into it
    const sel = state.selected;
    if (sel?.type === "clip" && sel.beatIndex === index) {
      const slot = beat.selectedClips.find((c) => c.media.id === sel.clipId && c.gap);
      if (slot) {
        const len = slot.trimEnd - slot.trimStart;
        const trimEnd = media.kind === "image" ? len : Math.min(media.duration, len);
        dispatch({
          type: "PATCH_BEAT",
          index,
          patch: {
            selectedClips: beat.selectedClips.map((c) =>
              c.media.id === sel.clipId ? { media, trimStart: 0, trimEnd } : c
            ),
          },
        });
        dispatch({ type: "SELECT", item: { type: "clip", beatIndex: index, clipId: media.id } });
        return;
      }
    }

    const already = beat.selectedClips.some((c) => c.media.id === media.id);
    if (already) {
      dispatch({
        type: "PATCH_BEAT",
        index,
        patch: { selectedClips: beat.selectedClips.filter((c) => c.media.id !== media.id) },
      });
      return;
    }
    const remaining = remainingTime(beat);
    if (remaining <= 0) return;
    const trimEnd = media.kind === "image" ? Math.min(4, remaining) : Math.min(media.duration, remaining);
    dispatch({
      type: "PATCH_BEAT",
      index,
      patch: { selectedClips: [...beat.selectedClips, { media, trimStart: 0, trimEnd }] },
    });
  }

  if (state.beats.length === 0) {
    return (
      <div style={{ padding: "14px" }}>
        <h3 style={{ fontSize: "13px", margin: "0 0 8px" }}>Media</h3>
        <p style={{ fontSize: "12px", color: "#5c5f68" }}>Generate beats in the AI tab first.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px" }}>
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "30px" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "820px", width: "100%" }}>
            {preview.media.kind === "video" ? (
              <video src={preview.media.previewUrl} controls autoPlay style={{ width: "100%", maxHeight: "68vh", borderRadius: "10px", background: "#000" }} />
            ) : (
              <img src={preview.media.previewUrl} alt="preview" style={{ width: "100%", maxHeight: "68vh", objectFit: "contain", borderRadius: "10px", background: "#000" }} />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px" }}>
              <span style={{ fontSize: "12px", color: "#9295a0" }}>{preview.media.source}</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    toggleSelect(preview.beatIndex, preview.media);
                    setPreview(null);
                  }}
                >
                  {state.beats[preview.beatIndex]?.selectedClips.some((c) => c.media.id === preview.media.id) ? "Unselect" : "Select this"}
                </button>
                <button className="btn btn-secondary" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <h3 style={{ fontSize: "13px", margin: 0 }}>Media</h3>
        <button onClick={findAll} className="btn btn-secondary" style={{ fontSize: "11px", padding: "4px 10px" }}>
          Generate All
        </button>
      </div>

      {state.beats.map((beat, i) => {
        const all = [...(beat.videos || []), ...(beat.images || [])];
        const remaining = remainingTime(beat);
        return (
          <div key={i} style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "10px", color: "#ff8a65", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
              B{i + 1} · {beat.duration.toFixed(1)}S · {remaining.toFixed(1)}S LEFT
            </div>
            <p style={{ fontSize: "11px", color: "#9295a0", margin: "0 0 6px", lineHeight: 1.4 }}>
              {beat.text.length > 90 ? beat.text.slice(0, 90) + "..." : beat.text}
            </p>
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              <button onClick={() => findMedia(i)} disabled={beat.loadingMedia} className="btn btn-secondary" style={{ fontSize: "11px", padding: "4px 10px" }}>
                {beat.loadingMedia ? "Searching..." : "Generate"}
              </button>
              {all.length > 0 && (
                <button onClick={() => findMedia(i, true)} disabled={beat.loadingMedia} className="btn btn-secondary" style={{ fontSize: "11px", padding: "4px 10px" }}>
                  ↻
                </button>
              )}
            </div>
            {all.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {all.map((m) => {
                  const isSel = beat.selectedClips.some((c) => c.media.id === m.id);
                  const disabled = !isSel && remaining <= 0;
                  return (
                    <div
                      key={m.id}
                      onClick={() => !disabled && toggleSelect(i, m)}
                      style={{
                        position: "relative",
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.35 : 1,
                        outline: isSel ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                        borderRadius: "6px",
                        overflow: "hidden",
                        aspectRatio: "16 / 9",
                        background: `url(${m.thumbnail}) center/cover, #17181c`,
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreview({ beatIndex: i, media: m });
                        }}
                        style={{ position: "absolute", top: "3px", right: "3px", width: "20px", height: "20px", borderRadius: "5px", border: "none", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "11px", cursor: "pointer", lineHeight: 1 }}
                      >
                        ⤢
                      </button>
                      <span style={{ position: "absolute", bottom: "3px", left: "3px", fontSize: "8px", fontFamily: "var(--font-mono)", color: "#fff", background: "rgba(0,0,0,0.6)", padding: "1px 4px", borderRadius: "3px" }}>
                        {isSel ? "✓" : m.kind === "image" ? "IMG" : `${m.duration}s`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
