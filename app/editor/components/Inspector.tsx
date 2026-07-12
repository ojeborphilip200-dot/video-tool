"use client";

import { useState } from "react";
import { useProject, makeGapMedia, MediaItem } from "../store";

export default function Inspector() {
  const { state, dispatch } = useProject();
  const [regenerating, setRegenerating] = useState(false);

  if (state.selected?.type !== "clip") {
    return (
      <div style={{ padding: "16px" }}>
        <h3 style={{ fontSize: "13px", margin: "0 0 8px" }}>Properties</h3>
        <p style={{ fontSize: "12px", color: "#5c5f68", lineHeight: 1.5 }}>
          Select a clip on the timeline to edit its trim and duration.
        </p>
      </div>
    );
  }

  const { beatIndex, clipId } = state.selected;
  const beat = state.beats[beatIndex];
  const clip = beat?.selectedClips.find((c) => c.media.id === clipId);
  if (!beat || !clip) {
    return (
      <div style={{ padding: "16px" }}>
        <p style={{ fontSize: "12px", color: "#5c5f68" }}>Selection no longer exists.</p>
      </div>
    );
  }

  const isGap = clip.gap === true;
  const used = beat.selectedClips.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0);
  const remaining = Math.max(0, beat.duration - used);
  const isImage = clip.media.kind === "image";

  function patchClip(trimStart: number, trimEnd: number) {
    dispatch({
      type: "PATCH_BEAT",
      index: beatIndex,
      patch: {
        selectedClips: beat.selectedClips.map((c) =>
          c.media.id === clipId ? { ...c, trimStart, trimEnd } : c
        ),
      },
    });
  }

  // Sources a fresh, script-relevant candidate for THIS slot only. Runs the full
  // curation engine (entity queries -> tiered search -> rubric -> vision check),
  // excludes everything already used anywhere in the video, keeps the slot's timing.
  async function regenerateSlot() {
    if (!beat || !clip) return;
    const slotLen = clip.trimEnd - clip.trimStart;
    const wantKind = clip.gap ? null : clip.media.kind;
    setRegenerating(true);

    const excludeIds = [
      ...new Set(
        state.beats.flatMap((b) => [
          ...(b.videos || []).map((m) => m.id),
          ...(b.images || []).map((m) => m.id),
          ...b.selectedClips.map((c) => c.media.id),
        ])
      ),
    ];

    const page = (beat.mediaPage || 1) + 1;

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
          mediaType:
            wantKind === "video" ? "video" : wantKind === "image" ? "image" : state.settings.mediaPref,
        }),
      });
      const data = await res.json();
      const videos: MediaItem[] = data.videos || [];
      const images: MediaItem[] = data.images || [];

      // Top-ranked candidate matching the slot's kind, else best of either
      const pool =
        wantKind === "video" ? videos : wantKind === "image" ? images : [...videos, ...images];
      const pick = pool[0] || videos[0] || images[0];

      if (!pick) {
        alert("No fresh candidates found for this beat — try Regenerate in the Media tab for a wider search.");
        setRegenerating(false);
        return;
      }

      const trimEnd = pick.kind === "image" ? slotLen : Math.min(pick.duration, slotLen);

      dispatch({
        type: "PATCH_BEAT",
        index: beatIndex,
        patch: {
          videos,
          images,
          mediaPage: page,
          selectedClips: beat.selectedClips.map((c) =>
            c.media.id === clipId ? { media: pick, trimStart: 0, trimEnd } : c
          ),
        },
      });
      dispatch({ type: "SELECT", item: { type: "clip", beatIndex, clipId: pick.id } });
    } catch {
      alert("Regeneration failed — please try again.");
    }
    setRegenerating(false);
  }

  const label = { fontSize: "10px", color: "#5c5f68", margin: "10px 0 3px" } as const;
  const input = { width: "100%", fontSize: "12px" } as const;

  if (isGap) {
    return (
      <div style={{ padding: "16px" }}>
        <h3 style={{ fontSize: "13px", margin: "0 0 2px" }}>EMPTY SLOT</h3>
        <p style={{ fontSize: "10px", color: "#5c5f68", margin: "0 0 10px" }}>Beat {beatIndex + 1}</p>
        <div style={{ aspectRatio: "16/9", borderRadius: "6px", border: "1px dashed #5c5f68", background: "repeating-linear-gradient(45deg,#141519,#141519 6px,#1b1c21 6px,#1b1c21 12px)" }} />
        <p style={label}>Slot length (s)</p>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={Number((clip.trimEnd - clip.trimStart).toFixed(1))}
          onChange={(e) => {
            const want = parseFloat(e.target.value) || 0.5;
            const maxAllowed = clip.trimEnd - clip.trimStart + remaining;
            patchClip(0, Math.max(0.5, Math.min(want, maxAllowed)));
          }}
          style={input}
        />
        <p style={{ fontSize: "11px", color: "#9295a0", marginTop: "12px", lineHeight: 1.5 }}>
          Open the <strong>Media</strong> tab and click any clip to drop it into this slot.
        </p>
        <button
          className="btn btn-primary"
          disabled={regenerating}
          style={{ marginTop: "12px", width: "100%", fontSize: "12px" }}
          onClick={regenerateSlot}
        >
          {regenerating ? "Sourcing..." : "↻ Regenerate clip for this spot"}
        </button>

        <button
          className="btn btn-secondary"
          style={{ marginTop: "6px", width: "100%", fontSize: "12px" }}
          onClick={() => {
            dispatch({
              type: "PATCH_BEAT",
              index: beatIndex,
              patch: { selectedClips: beat.selectedClips.filter((c) => c.media.id !== clipId) },
            });
            dispatch({ type: "SELECT", item: null });
          }}
        >
          Close gap (reclaim {(clip.trimEnd - clip.trimStart).toFixed(1)}s)
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      <h3 style={{ fontSize: "13px", margin: "0 0 2px" }}>{isImage ? "IMAGE" : "VIDEO"}</h3>
      <p style={{ fontSize: "10px", color: "#5c5f68", margin: "0 0 8px" }}>
        Beat {beatIndex + 1} · {clip.media.source}
      </p>

      <img src={clip.media.thumbnail} alt="" style={{ width: "100%", borderRadius: "6px", aspectRatio: "16/9", objectFit: "cover" }} />

      {isImage ? (
        <>
          <p style={label}>Duration (s)</p>
          <input
            type="number"
            min={1}
            step={0.5}
            value={Number((clip.trimEnd - clip.trimStart).toFixed(1))}
            onChange={(e) => {
              const want = parseFloat(e.target.value) || 1;
              const maxAllowed = clip.trimEnd - clip.trimStart + remaining;
              patchClip(0, Math.max(1, Math.min(want, maxAllowed)));
            }}
            style={input}
          />
        </>
      ) : (
        <>
          <p style={label}>Trim start (s)</p>
          <input
            type="number"
            min={0}
            max={clip.media.duration}
            step={0.1}
            value={Number(clip.trimStart.toFixed(1))}
            onChange={(e) => {
              const v = Math.max(0, Math.min(parseFloat(e.target.value) || 0, clip.trimEnd - 0.5));
              patchClip(v, clip.trimEnd);
            }}
            style={input}
          />
          <p style={label}>Trim end (s)</p>
          <input
            type="number"
            min={0}
            max={clip.media.duration}
            step={0.1}
            value={Number(clip.trimEnd.toFixed(1))}
            onChange={(e) => {
              const maxAllowed = Math.min(clip.media.duration, clip.trimEnd + remaining);
              const v = Math.max(clip.trimStart + 0.5, Math.min(parseFloat(e.target.value) || 0, maxAllowed));
              patchClip(clip.trimStart, v);
            }}
            style={input}
          />
          <p style={{ fontSize: "10px", color: "#5c5f68", marginTop: "6px" }}>
            Source length: {clip.media.duration}s · playing {(clip.trimEnd - clip.trimStart).toFixed(1)}s
          </p>
        </>
      )}

      <button
        className="btn btn-primary"
        disabled={regenerating}
        style={{ marginTop: "14px", width: "100%", fontSize: "12px" }}
        onClick={regenerateSlot}
      >
        {regenerating ? "Sourcing..." : "↻ Regenerate this clip"}
      </button>

      <button
        className="btn btn-secondary"
        style={{ marginTop: "6px", width: "100%", fontSize: "12px" }}
        onClick={() => {
          const gapMedia = makeGapMedia();
          dispatch({
            type: "PATCH_BEAT",
            index: beatIndex,
            patch: {
              selectedClips: beat.selectedClips.map((c) =>
                c.media.id === clipId
                  ? { media: gapMedia, trimStart: 0, trimEnd: c.trimEnd - c.trimStart, gap: true }
                  : c
              ),
            },
          });
          dispatch({ type: "SELECT", item: { type: "clip", beatIndex, clipId: gapMedia.id } });
        }}
      >
        Remove (leave empty slot)
      </button>

      <button
        className="btn btn-secondary"
        style={{ marginTop: "6px", width: "100%", fontSize: "12px" }}
        onClick={() => {
          dispatch({
            type: "PATCH_BEAT",
            index: beatIndex,
            patch: { selectedClips: beat.selectedClips.filter((c) => c.media.id !== clipId) },
          });
          dispatch({ type: "SELECT", item: null });
        }}
      >
        Remove &amp; close gap
      </button>
    </div>
  );
}
