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
};

export function useExport() {
  const { state } = useProject();
  const [status, setStatus] = useState<ExportStatus>({
    rendering: false,
    progress: 0,
    message: "",
    videoUrl: null,
    renderedWithCaptions: true,
  });

  const { clips, beatWindows, total } = deriveTimeline(state.beats);
  const canExport = state.audioFile !== null && clips.length > 0 && !status.rendering;

  async function exportVideo(captionsOverride?: boolean) {
    if (state.audioFile === null || clips.length === 0 || status.rendering) return;
    const withCaptions =
      captionsOverride === undefined ? state.settings.captionsEnabled : captionsOverride;
    setStatus({ rendering: true, progress: 0, message: "Received", videoUrl: null, renderedWithCaptions: withCaptions });

    // Same payload shape the render route already consumes. Empty slots become
    // black frames of the same length, so the render matches the preview exactly.
    const payload = clips.map((c) => ({
      url: c.gap ? "black:" : c.previewUrl,
      kind: c.gap ? ("image" as const) : c.kind,
      trimStart: c.gap ? 0 : c.trimStart,
      trimEnd: c.gap ? c.end - c.start : c.trimEnd,
    }));

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

      const poll = async (): Promise<void> => {
        try {
          const sRes = await fetch(`/api/render-status?id=${jobId}`);
          const job = await sRes.json();

          if (job.status === "error") {
            setStatus((s) => ({ ...s, rendering: false, progress: 0, message: "", videoUrl: null }));
            alert("Error: " + (job.error || "Render failed"));
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
          setStatus((s) => ({ ...s, progress: job.progress || 0, message: job.message || "Working..." }));
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

  function clearResult() {
    setStatus((s) => ({ ...s, videoUrl: null }));
  }

  return { status, exportVideo, canExport, clearResult, totalDuration: total };
}
