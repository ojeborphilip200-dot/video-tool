"use client";

import { useEffect, useState } from "react";
import { useProject, makeGapMedia, MediaItem } from "../store";

export default function Inspector() {
  const { state, dispatch } = useProject();
  const [regenerating, setRegenerating] = useState(false);
  const [capDraft, setCapDraft] = useState("");

  const capSel = state.selected?.type === "caption" ? state.selected : null;
  useEffect(() => {
    if (capSel) {
      setCapDraft(
        state.words
          .slice(capSel.wordStart, capSel.wordEnd + 1)
          .map((w) => w.word)
          .join(" ")
      );
    }
  }, [capSel?.wordStart, capSel?.wordEnd]);

  if (capSel) {
    const original = state.words
      .slice(capSel.wordStart, capSel.wordEnd + 1)
      .map((w) => w.word)
      .join(" ");
    return (
      <div style={{ padding: "16px" }}>
        <h3 style={{ fontSize: "13px", margin: "0 0 2px" }}>CAPTION</h3>
        <p style={{ fontSize: "10px", color: "var(--ed-text-3)", margin: "0 0 10px" }}>
          {state.words[capSel.wordStart].start.toFixed(1)}s · edit to fix misspellings
        </p>
        <textarea
          value={capDraft}
          onChange={(e) => setCapDraft(e.target.value)}
          rows={3}
          style={{ width: "100%", fontSize: "13px", lineHeight: 1.5 }}
        />
        <button
          className="btn btn-primary"
          disabled={capDraft.trim().length === 0 || capDraft.trim() === original}
          style={{ marginTop: "10px", width: "100%", fontSize: "12px" }}
          onClick={() =>
            dispatch({ type: "EDIT_CAPTION", wordStart: capSel.wordStart, wordEnd: capSel.wordEnd, text: capDraft })
          }
        >
          Save caption
        </button>
        <p style={{ fontSize: "10px", color: "var(--ed-text-3)", marginTop: "10px", lineHeight: 1.5 }}>
          The fix flows through the preview and the final render automatically. Cmd+Z undoes.
        </p>
      </div>
    );
  }

  const selT = state.selected;
  if (selT?.type === "text") {
    const co = state.textEvents?.callouts.find((c) => c.id === selT.eventId);
    const cu = state.textEvents?.countups.find((c) => c.id === selT.eventId);
    if (!co && !cu) {
      return (
        <div style={{ padding: "16px" }}>
          <p style={{ fontSize: "12px", color: "var(--ed-text-3)" }}>Selection no longer exists.</p>
        </div>
      );
    }
    return (
      <div style={{ padding: "16px" }}>
        <h3 style={{ fontSize: "13px", margin: "0 0 2px" }}>{co ? "TEXT ANIMATION" : "COUNT-UP"}</h3>
        <p style={{ fontSize: "10px", color: "var(--ed-text-3)", margin: "0 0 10px" }}>
          {co
            ? `"${co.text}" · ${co.start.toFixed(1)}s`
            : `${cu!.prefix}${cu!.value}${cu!.suffix} · lands ${cu!.land.toFixed(1)}s`}
        </p>
        {(() => {
          const evStart = co ? co.start : cu!.animStart;
          const evEnd = co ? co.end : cu!.land;
          const ctx = state.words.filter((w) => w.end >= evStart - 3.5 && w.start <= evEnd + 3.5);
          if (ctx.length === 0) return null;

          // Highlight ONLY the words the animation is about: match the event's
          // own text as a consecutive phrase inside the context
          const cleanW = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const phrase = (co ? co.text : (cu!.phrase || String(cu!.value)))
            .toLowerCase()
            .split(/\s+/)
            .map(cleanW)
            .filter(Boolean);
          const hotSet = new Set<number>();

          // Tier 1: exact consecutive phrase
          if (phrase.length > 0) {
            for (let s = 0; s <= ctx.length - phrase.length; s++) {
              let ok = true;
              for (let j = 0; j < phrase.length; j++) {
                if (cleanW(ctx[s + j].word) !== phrase[j]) { ok = false; break; }
              }
              if (ok) {
                for (let j = 0; j < phrase.length; j++) hotSet.add(s + j);
                break;
              }
            }
          }

          // Tier 2: looser consecutive match (prefix either direction, handles
          // "1969," vs "1969" and partial transcription differences)
          if (hotSet.size === 0 && phrase.length > 0) {
            const loose = (a: string, b: string) =>
              a.length > 2 && b.length > 2 && (a.startsWith(b) || b.startsWith(a));
            for (let s = 0; s <= ctx.length - phrase.length; s++) {
              let ok = true;
              for (let j = 0; j < phrase.length; j++) {
                const w = cleanW(ctx[s + j].word);
                if (w !== phrase[j] && !loose(w, phrase[j])) { ok = false; break; }
              }
              if (ok) {
                for (let j = 0; j < phrase.length; j++) hotSet.add(s + j);
                break;
              }
            }
          }

          // Tier 3 (guaranteed): the words at the event's spoken moment
          if (hotSet.size === 0) {
            const spokenStart = co ? co.start : Math.max(cu!.animStart, cu!.land - 1.2);
            const spokenEnd = co ? Math.min(co.end, co.start + 1.4) : cu!.land;
            ctx.forEach((w, wi) => {
              if (w.end > spokenStart && w.start < spokenEnd) hotSet.add(wi);
            });
          }
          return (
            <div style={{ background: "var(--ed-bg-2)", border: "1px solid var(--ed-border)", borderRadius: "8px", padding: "10px 12px", margin: "0 0 12px" }}>
              <p style={{ fontSize: "9px", color: "var(--ed-text-3)", margin: "0 0 5px", letterSpacing: "0.08em" }}>NARRATION AT THIS MOMENT</p>
              <p style={{ fontSize: "12px", lineHeight: 1.6, margin: 0, color: "var(--ed-text-2)" }}>
                …{ctx.map((w, wi) => {
                  const hot = hotSet.has(wi);
                  return (
                    <span key={wi} style={hot ? { color: "var(--ed-accent)", fontWeight: 700 } : undefined}>
                      {w.word}{" "}
                    </span>
                  );
                })}…
              </p>
            </div>
          );
        })()}
        <button
          className="btn btn-secondary"
          style={{ width: "100%", fontSize: "12px" }}
          onClick={() => dispatch({ type: "REMOVE_TEXT_EVENT", eventId: selT.eventId })}
        >
          Delete (or press Delete key)
        </button>
        <p style={{ fontSize: "10px", color: "var(--ed-text-3)", marginTop: "10px", lineHeight: 1.5 }}>
          Deleted animations won't appear in the export. Cmd+Z restores.
        </p>
      </div>
    );
  }

  if (state.selected?.type !== "clip") {
    return (
      <div style={{ padding: "16px" }}>
        <h3 style={{ fontSize: "13px", margin: "0 0 8px" }}>Properties</h3>
        <p style={{ fontSize: "12px", color: "var(--ed-text-3)", lineHeight: 1.5 }}>
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
        <p style={{ fontSize: "12px", color: "var(--ed-text-3)" }}>Selection no longer exists.</p>
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

  const label = { fontSize: "10px", color: "var(--ed-text-3)", margin: "10px 0 3px" } as const;
  const input = { width: "100%", fontSize: "12px" } as const;

  if (isGap) {
    return (
      <div style={{ padding: "16px" }}>
        <h3 style={{ fontSize: "13px", margin: "0 0 2px" }}>EMPTY SLOT</h3>
        <p style={{ fontSize: "10px", color: "var(--ed-text-3)", margin: "0 0 10px" }}>Beat {beatIndex + 1}</p>
        <div style={{ aspectRatio: "16/9", borderRadius: "6px", border: "1px dashed var(--ed-text-3)", background: "repeating-linear-gradient(45deg,var(--ed-bg-2),var(--ed-bg-2) 6px,var(--ed-bg-3) 6px,var(--ed-bg-3) 12px)" }} />
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
        <p style={{ fontSize: "11px", color: "var(--ed-text-2)", marginTop: "12px", lineHeight: 1.5 }}>
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
      <p style={{ fontSize: "10px", color: "var(--ed-text-3)", margin: "0 0 8px" }}>
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
          <p style={{ fontSize: "10px", color: "var(--ed-text-3)", marginTop: "6px" }}>
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
