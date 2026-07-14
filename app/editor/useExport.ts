"use client";

import { useState } from "react";
import { useProject } from "./store";
import { deriveTimeline } from "./timeline";

export type ExportStatus = {
  rendering: boolean;
  progress: number;
  message: string;
  videoUrl: string | null;
  renderedWithCaptions: boolean;
  etaSeconds: number | null;
  jobId: string | null;
};

export function useExport() {
  const { state } = useProject();
  const [status, setStatus] = useState<ExportStatus>({
    rendering: false,
    progress: 0,
    message: "",
    videoUrl: null,
    renderedWithCaptions: true,
    etaSeconds: null,
    jobId: null,
  });

  const { clips, beatWindows, total } = deriveTimeline(state.beats, state.words.length > 0 ? state.words[state.words.length - 1].end : undefined);
  const canExport = state.audioFile !== null && clips.length > 0 && !status.rendering;

  async function exportVideo(captionsOverride?: boolean) {
    if (state.audioFile === null || clips.length === 0 || status.rendering) return;
    const withCaptions =
      captionsOverride === undefined ? state.settings.captionsEnabled : captionsOverride;
    setStatus({
      rendering: true,
      progress: 0,
      message: "Received",
      videoUrl: null,
      renderedWithCaptions: withCaptions,
      etaSeconds: null,
      jobId: null,
    });

    // Same payload shape the render route already consumes. Empty slots become
    // black frames of the same length, so the render matches the preview exactly.
    // Each beat's clips are emitted inside that beat's narration window; any
    // unfilled remainder becomes black. Visuals therefore land on the exact
    // words they belong to, in the render as well as the preview.
    const entry = (c: (typeof clips)[number]) => {
      const beat = state.beats[c.beatIndex];
      const chosenIds = new Set(beat?.selectedClips.map((s) => s.media.id) || []);
      const pool = c.kind === "image" ? beat?.images || [] : beat?.videos || [];
      const alts =
        c.gap || c.previewUrl.startsWith("map:")
          ? []
          : pool
              .filter((m) => !chosenIds.has(m.id))
              .slice(0, 3)
              .map((m) => ({ url: m.previewUrl, kind: m.kind }));

      return {
        url: c.gap ? "black:" : c.previewUrl,
        kind: c.gap ? ("image" as const) : c.kind,
        trimStart: c.gap ? 0 : c.trimStart,
        trimEnd: c.gap ? c.end - c.start : c.trimEnd,
        alts,
      };
    };

    const payload: ReturnType<typeof entry>[] = [];
    for (const w of beatWindows) {
      const beatClips = clips
        .filter((c) => c.beatIndex === w.beatIndex)
        .sort((a, b) => a.start - b.start);
      let used = 0;
      for (const c of beatClips) {
        payload.push(entry(c));
        used += c.end - c.start;
      }
      const remainder = w.end - w.start - used;
      if (remainder > 0.08) {
        payload.push({
          url: "black:",
          kind: "image" as const,
          trimStart: 0,
          trimEnd: remainder,
          alts: [],
        });
      }
    }

    const formData = new FormData();
    formData.append("clips", JSON.stringify(payload));
    formData.append(
      "beatWindows",
      JSON.stringify(
        beatWindows.map((w) => ({
          start: w.start,
          end: w.end,
          imagesOnly:
            state.beats[w.beatIndex]?.selectedClips.length > 0 &&
            state.beats[w.beatIndex].selectedClips.every(
              (c) => c.gap === true || c.media.kind === "image"
            ),
        }))
      )
    );
    formData.append("words", JSON.stringify(state.words));
    formData.append("script", state.script);
    formData.append("captionsEnabled", String(withCaptions));
    formData.append("calloutsEnabled", String(state.settings.calloutsEnabled));
    formData.append("countupLevel", state.settings.countupLevel);
    formData.append("textStyle", state.settings.textStyle);
    if (state.textEvents) {
      formData.append("textEvents", JSON.stringify(state.textEvents));
    }
    formData.append("background", state.settings.background);
    formData.append("bgFrequency", state.settings.bgFrequency);
    formData.append("sfxShutter", String(state.settings.sfxShutter));
    formData.append("sfxCountup", String(state.settings.sfxCountup));
    if (state.audioFile) formData.append("audio", state.audioFile);
    if (state.musicFile) formData.append("music", state.musicFile);

    try {
      const res = await fetch("/api/render", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        setStatus((s) => ({ ...s, rendering: false, progress: 0, message: "", videoUrl: null }));
        alert("Error: " + (data.error || "Render failed"));
        return;
      }
      const { jobId } = await res.json();
      setStatus((s) => ({ ...s, jobId }));

      const poll = async (): Promise<void> => {
        try {
          const sRes = await fetch(`/api/render-status?id=${jobId}`);
          const job = await sRes.json();

          if (job.status === "error") {
            setStatus((s) => ({ ...s, rendering: false, progress: 0, message: "", videoUrl: null }));
            alert("Error: " + (job.error || "Render failed"));
            return;
          }
          if (job.status === "cancelled") {
            setStatus((s) => ({ ...s, rendering: false, progress: 0, message: "", videoUrl: null, etaSeconds: null, jobId: null }));
            return;
          }
          if (job.status === "done") {
            const rRes = await fetch(`/api/render-result?id=${jobId}`);
            const blob = await rRes.blob();
            setStatus((s) => ({
              ...s,
              rendering: false,
              progress: 100,
              message: "Done",
              videoUrl: URL.createObjectURL(blob),
            }));
            return;
          }
          setStatus((s) => ({
            ...s,
            progress: job.progress || 0,
            message: job.message || "Working...",
            etaSeconds: typeof job.etaSeconds === "number" ? job.etaSeconds : s.etaSeconds,
          }));
        } catch {
          // transient - keep polling
        }
        setTimeout(poll, 1500);
      };
      poll();
    } catch (err: any) {
      setStatus((s) => ({ ...s, rendering: false, progress: 0, message: "", videoUrl: null }));
      alert("Error: " + err.message);
    }
  }

  async function cancelExport() {
    if (!status.jobId) return;
    try {
      await fetch(`/api/render-cancel?id=${status.jobId}`, { method: "POST" });
    } catch {
      // the poll will settle it either way
    }
    setStatus((s) => ({ ...s, rendering: false, progress: 0, message: "", etaSeconds: null, jobId: null }));
  }

  function clearResult() {
    setStatus((s) => ({ ...s, videoUrl: null }));
  }

  return { status, exportVideo, canExport, clearResult, cancelExport, totalDuration: total };
}
