"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { useProject } from "../store";
import { deriveTimeline, deriveCaptionChunks } from "../timeline";

const LABEL_W = 86;

export default function TimelineDock() {
  const { state, dispatch } = useProject();
  const [zoom, setZoom] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  const { clips, beatWindows, total } = useMemo(() => deriveTimeline(state.beats, state.words.length > 0 ? state.words[state.words.length - 1].end : undefined), [state.beats]);
  const chunks = useMemo(() => deriveCaptionChunks(state.words), [state.words]);

  const narrDur = state.words.length > 0 ? state.words[state.words.length - 1].end : 0;
  const timelineDur = Math.max(total, narrDur, 1);
  const pxPerSec = 12 * zoom;
  const contentW = timelineDur * pxPerSec;

  const audioUrl = useMemo(
    () => (state.audioFile ? URL.createObjectURL(state.audioFile) : null),
    [state.audioFile]
  );
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // Mini waveform in the VOICE lane
  useEffect(() => {
    if (!waveRef.current || !state.audioFile) return;
    const ws = WaveSurfer.create({
      container: waveRef.current,
      waveColor: "var(--ed-text-3)",
      progressColor: "var(--ed-text-3)",
      cursorWidth: 0,
      height: 20,
      interact: false,
      minPxPerSec: pxPerSec,
    });
    ws.loadBlob(state.audioFile);
    wsRef.current = ws;
    return () => { ws.destroy(); wsRef.current = null; };
  }, [state.audioFile]);

  useEffect(() => {
    try { wsRef.current?.zoom(pxPerSec); } catch {}
  }, [pxPerSec]);

  // Master clock: narration audio drives currentTime; fallback clock without audio
  useEffect(() => {
    if (!state.playing) {
      audioRef.current?.pause();
      return;
    }
    const el = audioRef.current;
    if (el) {
      el.currentTime = state.currentTime;
      el.play().catch(() => {});
      const iv = setInterval(() => {
        dispatch({ type: "SET_TIME", t: el.currentTime });
        if (el.ended || el.currentTime >= timelineDur) {
          dispatch({ type: "SET_PLAYING", playing: false });
        }
      }, 66);
      return () => { clearInterval(iv); el.pause(); };
    }
    const startedAt = performance.now() - state.currentTime * 1000;
    const iv = setInterval(() => {
      const t = (performance.now() - startedAt) / 1000;
      if (t >= timelineDur) {
        dispatch({ type: "SET_TIME", t: timelineDur });
        dispatch({ type: "SET_PLAYING", playing: false });
      } else {
        dispatch({ type: "SET_TIME", t });
      }
    }, 66);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playing]);

  // Enter / Space toggle playback anywhere in the editor (unless typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      // Rendered result on screen: the key controls THAT video
      const rendered = document.getElementById("rendered-video") as HTMLVideoElement | null;
      if (rendered) {
        e.preventDefault();
        if (rendered.paused) rendered.play().catch(() => {});
        else rendered.pause();
        return;
      }
      // Media preview overlay open: its own handler owns the keys
      if (document.getElementById("media-preview-overlay")) return;
      if (timelineDur <= 1) return;
      e.preventDefault();
      // At the end: play means restart from the beginning
      if (!state.playing && state.currentTime >= timelineDur - 0.1) {
        dispatch({ type: "SET_TIME", t: 0 });
        if (audioRef.current) audioRef.current.currentTime = 0;
      }
      dispatch({ type: "SET_PLAYING", playing: !state.playing });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.playing, timelineDur, dispatch]);

  // Delete/Backspace removes the selected text animation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const sel = state.selected;
      if (sel?.type !== "text") return;
      e.preventDefault();
      dispatch({ type: "REMOVE_TEXT_EVENT", eventId: sel.eventId });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selected, dispatch]);

  // Fit the whole video into the visible timeline width
  function fitToScreen() {
    const el = scrollRef.current;
    if (!el || timelineDur <= 0) return;
    const avail = el.clientWidth - LABEL_W - 24;
    if (avail <= 0) return;
    const z = avail / (timelineDur * 12);
    setZoom(Math.max(0.05, Math.min(5, z)));
  }

  // Non-destructive edge drag: only the trim window moves. The source file is
  // untouched, so shortening and re-extending is always lossless. Clamped to the
  // beat's narration window (visuals stay locked to the script) and, for videos,
  // to the source's real length.
  function startEdgeDrag(
    e: React.MouseEvent,
    beatIndex: number,
    clipId: string,
    edge: "start" | "end"
  ) {
    e.stopPropagation();
    e.preventDefault();
    dispatch({ type: "SET_PLAYING", playing: false });

    const beat = state.beats[beatIndex];
    const clip = beat?.selectedClips.find((c) => c.media.id === clipId);
    if (!beat || !clip) return;

    const others = beat.selectedClips
      .filter((c) => c.media.id !== clipId)
      .reduce((s, c) => s + (c.trimEnd - c.trimStart), 0);
    const maxLen = Math.max(0.5, beat.duration - others);
    const srcLen = clip.media.kind === "video" ? clip.media.duration : Infinity;

    const startX = e.clientX;
    const t0 = clip.trimStart;
    const t1 = clip.trimEnd;

    const move = (ev: MouseEvent) => {
      const d = (ev.clientX - startX) / pxPerSec;
      let ns = t0;
      let ne = t1;

      if (edge === "end") {
        ne = t1 + d;
        ne = Math.min(ne, ns + maxLen, srcLen === Infinity ? ns + maxLen : srcLen);
        ne = Math.max(ne, ns + 0.5);
      } else {
        if (clip.media.kind === "video") {
          ns = Math.max(0, t0 + d);
          ns = Math.min(ns, t1 - 0.5);
          if (t1 - ns > maxLen) ns = t1 - maxLen;
        } else {
          // Images have no source window: dragging the left edge changes length
          ne = Math.max(0.5, Math.min(t1 - d, maxLen));
        }
      }

      dispatch({
        type: "PATCH_BEAT",
        index: beatIndex,
        patch: {
          selectedClips: beat.selectedClips.map((c) =>
            c.media.id === clipId ? { ...c, trimStart: ns, trimEnd: ne } : c
          ),
        },
      });
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function seekFromClientX(clientX: number) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - LABEL_W;
    const t = Math.max(0, Math.min(timelineDur, x / pxPerSec));
    dispatch({ type: "SET_TIME", t });
    if (audioRef.current) audioRef.current.currentTime = t;
  }

  function fmt(t: number) {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
  }

  const ticks: number[] = [];
  const step = timelineDur > 180 ? 30 : timelineDur > 60 ? 10 : 5;
  for (let x = 0; x <= timelineDur; x += step) ticks.push(x);

  const lane = (label: string, children: React.ReactNode, h = 26) => (
    <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--ed-border)" }}>
      <div style={{ width: `${LABEL_W}px`, flexShrink: 0, fontSize: "9px", letterSpacing: "0.08em", color: "var(--ed-text-3)", display: "flex", alignItems: "center", paddingLeft: "10px" }}>
        {label}
      </div>
      <div style={{ position: "relative", height: `${h + 8}px`, width: `${contentW}px`, margin: "4px 0" }}>
        {children}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} />}

      {/* Transport */}
      <div style={{ height: "44px", position: "relative", display: "flex", alignItems: "center", padding: "0 14px", borderBottom: "1px solid var(--ed-border)", flexShrink: 0 }}>
        <button
          onClick={() => {
            if (!state.playing && state.currentTime >= timelineDur - 0.1) {
              dispatch({ type: "SET_TIME", t: 0 });
              if (audioRef.current) audioRef.current.currentTime = 0;
            }
            dispatch({ type: "SET_PLAYING", playing: !state.playing });
          }}
          disabled={timelineDur <= 1}
          title="Play/Pause (Enter)"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            background: "transparent",
            border: "none",
            color: "var(--ed-text-1)",
            fontSize: "20px",
            lineHeight: 1,
            cursor: timelineDur <= 1 ? "not-allowed" : "pointer",
            opacity: timelineDur <= 1 ? 0.3 : 1,
          }}
        >
          {state.playing ? "⏸" : "▶"}
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--ed-text-1)", background: "var(--ed-bg-2)", border: "1px solid var(--ed-border)", borderRadius: "999px", padding: "4px 12px" }}>
            {fmt(state.currentTime)} / {fmt(timelineDur)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
            className="btn btn-secondary"
            onClick={fitToScreen}
            disabled={timelineDur <= 1}
            title="Fit the whole video into view"
            style={{ fontSize: "11px", padding: "4px 10px" }}
          >
            Fit
          </button>
          <span style={{ fontSize: "10px", color: "var(--ed-text-3)" }}>Zoom</span>
            <input type="range" min={0.05} max={5} step={0.05} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Tracks */}
      <div
        ref={scrollRef}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).dataset?.clip) return;
          e.preventDefault();
          dispatch({ type: "SET_PLAYING", playing: false });
          seekFromClientX(e.clientX);
          const move = (ev: MouseEvent) => seekFromClientX(ev.clientX);
          const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        }}
        style={{ flex: 1, overflowX: "auto", overflowY: "auto", padding: "6px 0", position: "relative", cursor: "text" }}
      >
        <div style={{ width: `${LABEL_W + contentW}px`, position: "relative" }}>
          {/* Ruler */}
          <div style={{ display: "flex" }}>
            <div style={{ width: `${LABEL_W}px`, flexShrink: 0 }} />
            <div style={{ position: "relative", height: "14px", width: `${contentW}px` }}>
              {ticks.map((x) => (
                <span key={x} style={{ position: "absolute", left: `${x * pxPerSec}px`, fontSize: "8px", color: "var(--ed-text-3)", fontFamily: "var(--font-mono)" }}>
                  {Math.floor(x / 60)}:{String(Math.floor(x % 60)).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>


          {lane("VISUALS", clips.map((c) => {
            const isSel = state.selected?.type === "clip" && state.selected.clipId === c.id && state.selected.beatIndex === c.beatIndex;
            return (
              <div
                key={c.id + c.start}
                data-clip="1"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => dispatch({ type: "SELECT", item: { type: "clip", beatIndex: c.beatIndex, clipId: c.id } })}
                title={`B${c.beatIndex + 1} · ${c.source} · ${(c.end - c.start).toFixed(1)}s`}
                style={{
                  position: "absolute",
                  left: `${c.start * pxPerSec}px`,
                  width: `${(c.end - c.start) * pxPerSec - 2}px`,
                  top: "2px",
                  bottom: "2px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  outline: isSel
                    ? "2px solid var(--ed-accent)"
                    : c.gap
                    ? "1px dashed var(--ed-text-3)"
                    : "1px solid var(--ed-border-strong)",
                  background: c.gap ? "repeating-linear-gradient(45deg,var(--ed-bg-2),var(--ed-bg-2) 6px,var(--ed-bg-3) 6px,var(--ed-bg-3) 12px)" : `url(${c.thumbnail}) center/cover, var(--ed-bg-2)`,
                }}
              >
                {c.gap && (
                  <span style={{ fontSize: "8px", color: "var(--ed-text-3)", fontFamily: "var(--font-mono)" }}>EMPTY</span>
                )}
                {!c.gap && (
                  <>
                    <span
                      data-clip="1"
                      onMouseDown={(e) => startEdgeDrag(e, c.beatIndex, c.id, "start")}
                      title="Drag to trim the start"
                      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "10px", cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}
                    >
                      <span style={{ width: "3px", height: "55%", borderRadius: "2px", background: "rgba(255,255,255,0.85)" }} />
                    </span>
                    <span
                      data-clip="1"
                      onMouseDown={(e) => startEdgeDrag(e, c.beatIndex, c.id, "end")}
                      title="Drag to extend or shorten"
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "10px", cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}
                    >
                      <span style={{ width: "3px", height: "55%", borderRadius: "2px", background: "rgba(255,255,255,0.85)" }} />
                    </span>
                  </>
                )}
              </div>
            );
          }), 40)}


          {lane("CAPTIONS", state.settings.captionsEnabled ? chunks.map((c, i) => {
            const isSel =
              state.selected?.type === "caption" &&
              state.selected.wordStart === c.wordStart &&
              state.selected.wordEnd === c.wordEnd;
            return (
              <div
                key={i}
                data-clip="1"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  dispatch({ type: "SELECT", item: { type: "caption", wordStart: c.wordStart, wordEnd: c.wordEnd } });
                  dispatch({ type: "SET_PLAYING", playing: false });
                  dispatch({ type: "SET_TIME", t: Math.max(0, c.start - 0.1) });
                  if (audioRef.current) audioRef.current.currentTime = Math.max(0, c.start - 0.1);
                }}
                title={`"${c.text}" — click to edit`}
                style={{ position: "absolute", left: `${c.start * pxPerSec}px`, width: `${Math.max((c.end - c.start) * pxPerSec - 1, 4)}px`, top: "3px", bottom: "3px", borderRadius: "2px", cursor: "pointer", background: "rgba(79,124,255,0.3)", outline: isSel ? "2px solid var(--ed-accent)" : "none" }}
              />
            );
          }) : <span style={{ fontSize: "8px", color: "var(--ed-text-3)", paddingLeft: "6px", lineHeight: "22px" }}>off</span>)}

          {lane("VOICE", <div ref={waveRef} style={{ position: "absolute", inset: "2px 0" }} />, 24)}

          {lane("MUSIC", state.musicFile ? (
            <div style={{ position: "absolute", inset: "2px", borderRadius: "3px", background: "rgba(74,222,128,0.2)", fontSize: "8px", color: "#4ade80", paddingLeft: "6px", lineHeight: "18px" }}>
              {state.musicFile.name} · loops + auto-ducks
            </div>
          ) : <span style={{ fontSize: "8px", color: "var(--ed-text-3)", paddingLeft: "6px", lineHeight: "22px" }}>none</span>)}

          {/* Playhead */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              dispatch({ type: "SET_PLAYING", playing: false });
              const move = (ev: MouseEvent) => seekFromClientX(ev.clientX);
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
            style={{ position: "absolute", left: `${LABEL_W + state.currentTime * pxPerSec}px`, top: 0, bottom: 0, width: "16px", marginLeft: "-8px", cursor: "ew-resize", zIndex: 6 }}
          >
            <div style={{ position: "absolute", left: "7px", top: 0, bottom: 0, width: "2px", background: "#ff8a65" }} />
            <div
              style={{
                position: "absolute",
                left: "3px",
                top: "-2px",
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                background: "#ff8a65",
                boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
