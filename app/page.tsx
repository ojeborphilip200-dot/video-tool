"use client";

import { useState } from "react";
import ClipTimeline from "./components/ClipTimeline";
import VoiceoverWaveform from "./components/VoiceoverWaveform";

type MediaItem = {
  id: string;
  kind: "video" | "image";
  thumbnail: string;
  previewUrl: string;
  duration: number;
  source: string;
};

type SelectedClip = {
  media: MediaItem;
  trimStart: number;
  trimEnd: number;
};

type Beat = {
  text: string;
  keywords: string[];
  entities?: string[];
  queries?: string[];
  treatment: "video" | "image";
  duration: number;
  start: number;
  end: number;
  videos?: MediaItem[];
  images?: MediaItem[];
  loadingMedia?: boolean;
  mediaPage?: number;
  selectedClips: SelectedClip[];
};

function usedTime(beat: Beat): number {
  return beat.selectedClips.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0);
}

function remainingTime(beat: Beat): number {
  return Math.max(0, beat.duration - usedTime(beat));
}

export default function Home() {
  const [script, setScript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [segmenting, setSegmenting] = useState(false);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [words, setWords] = useState<{ word: string; start: number; end: number }[]>([]);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [calloutsEnabled, setCalloutsEnabled] = useState(true);
  const [countupLevel, setCountupLevel] = useState("medium");
  const [preview, setPreview] = useState<{ beatIndex: number; media: MediaItem } | null>(null);
  const [mediaPref, setMediaPref] = useState<"both" | "video" | "image">("both");
  const [autoFill, setAutoFill] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{ progress: number; message: string } | null>(null);
  const [background, setBackground] = useState("none");
  const [bgFrequency, setBgFrequency] = useState("2-3");
  const [textStyle, setTextStyle] = useState("standard");

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioFile(file);
    setTranscribing(true);

    const formData = new FormData();
    formData.append("audio", file);

    const res = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setTranscribing(false);

    if (data.text) {
      setScript(data.text);
      setWords(data.words || []);
    } else {
      alert("Error: " + (data.error || "Something went wrong"));
    }
  }

  // Fallback: simple sentence split if the AI segmentation call fails
  function splitBySentenceFallback(text: string): Beat[] {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return sentences.map((s) => ({
      text: s,
      keywords: [s.split(/\s+/).slice(0, 4).join(" ")],
      treatment: "video" as const,
      duration: Math.max(2, s.trim().split(/\s+/).length / 2.5),
      start: 0,
      end: 0,
      selectedClips: [],
    }));
  }

  async function handleSegment() {
    setSegmenting(true);
    setRenderedVideoUrl("");
    setBeats([]);

    try {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, words }),
      });

      const data = await res.json();

      if (data.beats && data.beats.length > 0) {
        setBeats(
          data.beats.map((b: any) => ({
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
        );
      } else {
        setBeats(splitBySentenceFallback(script));
      }
    } catch {
      setBeats(splitBySentenceFallback(script));
    }

    setSegmenting(false);
  }

  async function handleFindMedia(index: number, regenerate = false) {
    const page = regenerate ? (beats[index].mediaPage || 1) + 1 : beats[index].mediaPage || 1;

    // Cross-video diversity: exclude everything already shown or selected in
    // other beats, plus this beat's own current set when regenerating
    const excludeIds = [
      ...new Set(
        beats.flatMap((b, bi) => {
          const own = bi === index;
          if (own && !regenerate) return [];
          const galleryIds = own && regenerate
            ? [...(b.videos || []).map((m) => m.id), ...(b.images || []).map((m) => m.id)]
            : !own
            ? [...(b.videos || []).map((m) => m.id), ...(b.images || []).map((m) => m.id)]
            : [];
          return [...galleryIds, ...b.selectedClips.map((c) => c.media.id)];
        })
      ),
    ];
    setBeats((prev) =>
      prev.map((b, i) => (i === index ? { ...b, loadingMedia: true } : b))
    );

    const beat = beats[index];
    const query = beat.keywords.length > 0 ? beat.keywords.join(" ") : beat.text;

    const res = await fetch("/api/footage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        queries: beat.queries || [],
        entities: beat.entities || [],
        beatText: beat.text,
        keywords: beat.keywords,
        page,
        excludeIds,
        mediaType: mediaPref,
      }),
    });

    const data = await res.json();

    setBeats((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b;

        const videos: MediaItem[] = data.videos || [];
        const images: MediaItem[] = data.images || [];

        // AI pre-pick: auto-select the first result matching the beat's treatment
        let selectedClips = regenerate ? [] : b.selectedClips;
        if (selectedClips.length === 0) {
          const vPool = mediaPref === "image" ? [] : videos;
          const iPool = mediaPref === "video" ? [] : images;
          if (autoFill && iPool.length >= 2 && b.duration >= 6) {
            // Two best-ranked images, equal screen time, never under 3s each
            const per = b.duration / 2;
            selectedClips = iPool.slice(0, 2).map((m) => ({ media: m, trimStart: 0, trimEnd: per }));
          } else {
            const pick =
              b.treatment === "image" ? iPool[0] || vPool[0] : vPool[0] || iPool[0];
            if (pick) {
              const trimEnd =
                pick.kind === "image"
                  ? b.duration
                  : Math.min(pick.duration, b.duration);
              selectedClips = [{ media: pick, trimStart: 0, trimEnd }];
            }
          }
        }

        return { ...b, videos, images, loadingMedia: false, selectedClips, mediaPage: page };
      })
    );

    if (data.error) {
      alert("Error: " + data.error);
    }
  }

  async function handleFindAllMedia() {
    for (let i = 0; i < beats.length; i++) {
      await handleFindMedia(i);
    }
  }

  function toggleSelectMedia(beatIndex: number, media: MediaItem) {
    setBeats((prev) =>
      prev.map((b, i) => {
        if (i !== beatIndex) return b;

        const alreadySelected = b.selectedClips.some((c) => c.media.id === media.id);

        if (alreadySelected) {
          return {
            ...b,
            selectedClips: b.selectedClips.filter((c) => c.media.id !== media.id),
          };
        }

        const remaining = remainingTime(b);
        if (remaining <= 0) return b;

        const trimEnd =
          media.kind === "image" ? Math.min(4, remaining) : Math.min(media.duration, remaining);
        return {
          ...b,
          selectedClips: [...b.selectedClips, { media, trimStart: 0, trimEnd }],
        };
      })
    );
  }

  function updateClipTrim(beatIndex: number, clipId: string, start: number, end: number) {
    setBeats((prev) =>
      prev.map((b, i) => {
        if (i !== beatIndex) return b;
        return {
          ...b,
          selectedClips: b.selectedClips.map((c) =>
            c.media.id === clipId ? { ...c, trimStart: start, trimEnd: end } : c
          ),
        };
      })
    );
  }

  async function handleRenderVideo() {
    const clips = beats.flatMap((b) =>
      b.selectedClips.map((c) => ({
        url: c.media.previewUrl,
        kind: c.media.kind,
        trimStart: c.trimStart,
        trimEnd: c.trimEnd,
      }))
    );

    if (clips.length === 0) {
      alert("Select at least one clip for a beat first.");
      return;
    }

    setRendering(true);
    setRenderedVideoUrl("");

    // Beat windows in output-timeline seconds, so the backend can apply
    // the background frame to whole beats only
    const beatWindows: { start: number; end: number }[] = [];
    let winCursor = 0;
    for (const b of beats) {
      const dur = b.selectedClips.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0);
      if (dur > 0) {
        beatWindows.push({ start: winCursor, end: winCursor + dur });
        winCursor += dur;
      }
    }

    const formData = new FormData();
    formData.append("clips", JSON.stringify(clips));
    formData.append("beatWindows", JSON.stringify(beatWindows));
    formData.append("script", script);
    formData.append("words", JSON.stringify(words));
    formData.append("captionsEnabled", String(captionsEnabled));
    formData.append("calloutsEnabled", String(calloutsEnabled));
    formData.append("countupLevel", countupLevel);
    formData.append("background", background);
    formData.append("bgFrequency", bgFrequency);
    formData.append("textStyle", textStyle);
    if (audioFile) {
      formData.append("audio", audioFile);
    }
    if (musicFile) {
      formData.append("music", musicFile);
    }

    const res = await fetch("/api/render", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      setRendering(false);
      const data = await res.json();
      alert("Error: " + (data.error || "Rendering failed"));
      return;
    }

    const { jobId } = await res.json();

    const poll = async (): Promise<void> => {
      try {
        const sRes = await fetch(`/api/render-status?id=${jobId}`);
        const job = await sRes.json();

        if (job.status === "error") {
          setRendering(false);
          setRenderProgress(null);
          alert("Error: " + (job.error || "Rendering failed"));
          return;
        }

        if (job.status === "done") {
          const rRes = await fetch(`/api/render-result?id=${jobId}`);
          const blob = await rRes.blob();
          setRenderedVideoUrl(URL.createObjectURL(blob));
          setRendering(false);
          setRenderProgress(null);
          return;
        }

        setRenderProgress({ progress: job.progress || 0, message: job.message || "Working..." });
      } catch {
        // transient polling error - keep trying
      }
      setTimeout(poll, 1500);
    };

    poll();
  }

  return (
    <div className="app-shell">
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "900px", width: "100%" }}>
            {preview.media.kind === "video" ? (
              <video
                src={preview.media.previewUrl}
                controls
                autoPlay
                style={{ width: "100%", maxHeight: "70vh", borderRadius: "10px", background: "#000" }}
              />
            ) : (
              <img
                src={preview.media.previewUrl}
                alt="preview"
                style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: "10px", background: "#000" }}
              />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
              <span style={{ fontSize: "13px", color: "#9295a0" }}>
                {preview.media.source} · {preview.media.kind === "video" ? `${preview.media.duration}s video` : "image"}
              </span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    toggleSelectMedia(preview.beatIndex, preview.media);
                    setPreview(null);
                  }}
                >
                  {beats[preview.beatIndex]?.selectedClips.some((c) => c.media.id === preview.media.id)
                    ? "Unselect"
                    : "Select this"}
                </button>
                <button className="btn btn-secondary" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="app-header">
        <h1 className="app-title">My Video Tool</h1>
        <p className="app-subtitle">Script or voiceover in, edited video out.</p>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, marginBottom: "10px", fontSize: "14px", color: "#9295a0" }}>
          Upload a voiceover file (mp3/wav) to auto-transcribe
        </p>
        <input type="file" accept="audio/*" onChange={handleFileUpload} />
        {transcribing && <p className="empty-note">Transcribing... this may take a moment.</p>}

        <p style={{ marginTop: "20px", marginBottom: "10px", fontSize: "14px", color: "#9295a0" }}>
          Optional: upload background music
        </p>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setMusicFile(e.target.files?.[0] || null)}
        />

        <p style={{ marginTop: "20px", marginBottom: "10px", fontSize: "14px", color: "#9295a0" }}>
          Or paste/edit your script directly below
        </p>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={8}
          style={{ width: "100%", fontSize: "14px", lineHeight: 1.5 }}
          placeholder="Paste your script here..."
        />

        <button
          onClick={handleSegment}
          disabled={!script || segmenting}
          className="btn btn-primary"
          style={{ marginTop: "14px" }}
        >
          {segmenting ? "Analyzing script..." : "Generate beats"}
        </button>
      </div>

      {beats.length > 0 && (
        <div>
          {audioFile && (
            <VoiceoverWaveform
              audioFile={audioFile}
              beatMarkers={beats
                .filter((b) => b.end > b.start)
                .map((b, i) => ({ start: b.start, end: b.end, label: `B${i + 1}` }))}
            />
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 12px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#9295a0", margin: 0 }}>
              BEATS ({beats.length})
            </h2>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              {([
                { id: "both", label: "Video + Images" },
                { id: "video", label: "Video only" },
                { id: "image", label: "Images only" },
              ] as const).map((m) => (
                <div
                  key={m.id}
                  onClick={() => setMediaPref(m.id)}
                  style={{
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    border: mediaPref === m.id ? "1px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                    color: mediaPref === m.id ? "#eceef1" : "#9295a0",
                  }}
                >
                  {m.label}
                </div>
              ))}
              <div
                onClick={() => setAutoFill(!autoFill)}
                title="Automatically select the 2 best images on beats long enough to fit them (6s+), split equally"
                style={{
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  border: autoFill ? "1px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                  color: autoFill ? "#eceef1" : "#9295a0",
                }}
              >
                Auto 2-img
              </div>
            </div>
            <button
              onClick={handleFindAllMedia}
              className="btn btn-secondary"
              style={{ fontSize: "13px", padding: "8px 16px" }}
            >
              Generate All Footage
            </button>
          </div>

          {beats.map((beat, i) => {
            const remaining = remainingTime(beat);
            const allMedia = [...(beat.videos || []), ...(beat.images || [])];
            return (
              <div className="card" key={i}>
                <span className="chip chip-video">
                  BEAT {i + 1} · {beat.duration.toFixed(1)}S · {remaining.toFixed(1)}S LEFT · {beat.treatment.toUpperCase()}
                </span>
                <p className="beat-text">{beat.text}</p>
                {beat.keywords.length > 0 && (
                  <p style={{ fontSize: "12px", color: "#5c5f68", margin: "6px 0 0" }}>
                    Search: {beat.keywords.join(", ")}
                  </p>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                  <button
                    onClick={() => handleFindMedia(i)}
                    disabled={beat.loadingMedia}
                    className="btn btn-secondary"
                  >
                    {beat.loadingMedia ? "Searching..." : "Generate Footage"}
                  </button>
                  {((beat.videos && beat.videos.length > 0) || (beat.images && beat.images.length > 0)) && (
                    <button
                      onClick={() => handleFindMedia(i, true)}
                      disabled={beat.loadingMedia}
                      className="btn btn-secondary"
                    >
                      ↻ Regenerate
                    </button>
                  )}
                </div>

                {allMedia.length > 0 && (
                  <div className="thumb-row">
                    {allMedia.map((m) => {
                      const isSelected = beat.selectedClips.some((c) => c.media.id === m.id);
                      const disabled = !isSelected && remaining <= 0;
                      return (
                        <div
                          key={m.id}
                          className="thumb"
                          onClick={() => !disabled && toggleSelectMedia(i, m)}
                          style={{
                            cursor: disabled ? "not-allowed" : "pointer",
                            opacity: disabled ? 0.35 : 1,
                            outline: isSelected ? "2px solid var(--accent-blue)" : "none",
                            outlineOffset: "1px",
                          }}
                        >
                          <div className="thumb-frame" style={{ position: "relative" }}>
                            <img src={m.thumbnail} alt="media thumbnail" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreview({ beatIndex: i, media: m });
                              }}
                              title="Preview"
                              style={{
                                position: "absolute",
                                top: "4px",
                                right: "4px",
                                width: "24px",
                                height: "24px",
                                borderRadius: "6px",
                                border: "none",
                                background: "rgba(0,0,0,0.65)",
                                color: "#fff",
                                fontSize: "13px",
                                cursor: "pointer",
                                lineHeight: 1,
                              }}
                            >
                              ⤢
                            </button>
                          </div>
                          <div className="thumb-label">
                            {isSelected
                              ? "✓ selected"
                              : m.kind === "image"
                              ? "IMAGE"
                              : `${m.duration}s`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {beat.videos && beat.videos.length === 0 && beat.images && beat.images.length === 0 && (
                  <p className="empty-note">No media found.</p>
                )}

                {beat.selectedClips.map((clip) => (
                  <div key={clip.media.id} style={{ marginTop: "10px" }}>
                    <p style={{ fontSize: "12px", color: "#8a8d96", margin: "0 0 4px" }}>
                      Selected {clip.media.kind} ({clip.media.source})
                    </p>
                    {clip.media.kind === "video" ? (
                      <ClipTimeline
                        totalDuration={clip.media.duration}
                        trimStart={clip.trimStart}
                        trimEnd={clip.trimEnd}
                        onChange={(start, end) => updateClipTrim(i, clip.media.id, start, end)}
                      />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "12px", color: "#5c5f68" }}>Still image · shows for</span>
                        <input
                          type="number"
                          min={1}
                          step={0.5}
                          value={Number((clip.trimEnd - clip.trimStart).toFixed(1))}
                          onChange={(e) => {
                            const want = parseFloat(e.target.value) || 1;
                            const maxAllowed = clip.trimEnd - clip.trimStart + remainingTime(beat);
                            updateClipTrim(i, clip.media.id, 0, Math.max(1, Math.min(want, maxAllowed)));
                          }}
                          style={{ width: "60px" }}
                        />
                        <span style={{ fontSize: "12px", color: "#5c5f68" }}>s</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          <div className="render-section">
            <div style={{ marginBottom: "14px" }}>
              <p style={{ fontSize: "14px", color: "#9295a0", margin: "0 0 8px" }}>Text & graphics style</p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {[
                  { id: "standard", label: "Standard", desc: "Clean & versatile", font: "Arial, sans-serif", weight: 700 },
                  { id: "crime", label: "Crime", desc: "Bold & investigative", font: "'Arial Narrow', sans-serif", weight: 700 },
                  { id: "history", label: "History", desc: "Classic & archival", font: "Georgia, serif", weight: 700 },
                  { id: "modern", label: "Modern", desc: "Vibrant & kinetic", font: "'Helvetica Neue', sans-serif", weight: 700 },
                  { id: "minimalist", label: "Minimalist", desc: "Subtle & spacious", font: "'Helvetica Neue', sans-serif", weight: 300 },
                ].map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setTextStyle(s.id)}
                    style={{
                      cursor: "pointer",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      minWidth: "110px",
                      border: textStyle === s.id ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                      background: "var(--bg-elevated)",
                    }}
                  >
                    <div style={{ fontSize: "14px", color: "#eceef1", fontFamily: s.font, fontWeight: s.weight }}>{s.label}</div>
                    <div style={{ fontSize: "10px", color: "#5c5f68", marginTop: "3px" }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <p style={{ fontSize: "14px", color: "#9295a0", margin: "0 0 8px" }}>Background frame</p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {[
                  { id: "none", label: "None", bg: "#17181c" },
                  { id: "black", label: "Pure Black", bg: "#000" },
                  { id: "grid", label: "Dark Grid", bg: "repeating-linear-gradient(0deg,#0d0e12,#0d0e12 9px,#2a2c32 10px),repeating-linear-gradient(90deg,#0d0e12,#0d0e12 9px,#2a2c32 10px)" },
                  { id: "blue-gradient", label: "Blue", bg: "linear-gradient(#1a2c5b,#05070d)" },
                  { id: "green-gradient", label: "Green", bg: "linear-gradient(#14532d,#04100a)" },
                  { id: "vintage", label: "Vintage", bg: "linear-gradient(#e8dfc8,#c9bfa5)" },
                ].map((p) => (
                  <div key={p.id} onClick={() => setBackground(p.id)} style={{ cursor: "pointer", textAlign: "center" }}>
                    <div
                      style={{
                        width: "64px",
                        height: "40px",
                        borderRadius: "6px",
                        background: p.bg,
                        border: background === p.id ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                      }}
                    />
                    <div style={{ fontSize: "10px", color: "#9295a0", marginTop: "4px" }}>{p.label}</div>
                  </div>
                ))}
              </div>
              {background !== "none" && (
                <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
                  {[
                    { id: "2-3", label: "2-3 times", tip: "Good for 8-15 min videos" },
                    { id: "3-5", label: "3-5 times", tip: "Good for 30 min+ videos" },
                  ].map((o) => (
                    <div
                      key={o.id}
                      onClick={() => setBgFrequency(o.id)}
                      style={{
                        cursor: "pointer",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: bgFrequency === o.id ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                        background: "var(--bg-elevated)",
                      }}
                    >
                      <div style={{ fontSize: "13px", color: "#eceef1" }}>{o.label}</div>
                      <div style={{ fontSize: "11px", color: "#5c5f68", marginTop: "2px" }}>{o.tip}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", fontSize: "14px", color: "#9295a0" }}>
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(e) => setCaptionsEnabled(e.target.checked)}
              />
              Add captions to video
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", fontSize: "14px", color: "#9295a0" }}>
              <input
                type="checkbox"
                checked={calloutsEnabled}
                onChange={(e) => setCalloutsEnabled(e.target.checked)}
              />
              Add text graphics (years, locations)
            </label>
            <div style={{ marginBottom: "14px" }}>
              <p style={{ fontSize: "14px", color: "#9295a0", margin: "0 0 8px" }}>Number count-up overlays</p>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { id: "off", label: "Off", tip: "Never" },
                  { id: "low", label: "Low", tip: "~1 per 2-3 min" },
                  { id: "medium", label: "Medium", tip: "~1 per 60-90s" },
                  { id: "high", label: "High", tip: "Key stats" },
                ].map((o) => (
                  <div
                    key={o.id}
                    onClick={() => setCountupLevel(o.id)}
                    style={{
                      cursor: "pointer",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: countupLevel === o.id ? "2px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                      background: "var(--bg-elevated)",
                    }}
                  >
                    <div style={{ fontSize: "13px", color: "#eceef1" }}>{o.label}</div>
                    <div style={{ fontSize: "10px", color: "#5c5f68", marginTop: "2px" }}>{o.tip}</div>
                  </div>
                ))}
              </div>
            </div>
            {rendering && renderProgress && (
              <div style={{ marginBottom: "10px" }}>
                <div style={{ height: "6px", background: "#2a2c32", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${renderProgress.progress}%`, background: "var(--accent-blue)", transition: "width 0.4s" }} />
                </div>
                <p style={{ fontSize: "12px", color: "#9295a0", margin: "6px 0 0" }}>{renderProgress.message}</p>
              </div>
            )}
            <button
              onClick={handleRenderVideo}
              disabled={rendering || beats.some((b) => b.loadingMedia)}
              className="btn btn-primary"
              style={{ width: "100%", padding: "14px", fontSize: "15px" }}
            >
              {rendering ? "Rendering..." : "Render Full Video"}
            </button>

            {renderedVideoUrl && (
              <div className="video-result">
                <h3 style={{ fontSize: "14px", color: "#9295a0", fontWeight: 500 }}>Your rendered video</h3>
                <video src={renderedVideoUrl} controls width="100%" />
                <a href={renderedVideoUrl} download="final-video.mp4">
                  <button className="btn btn-secondary" style={{ marginTop: "12px" }}>
                    Download Video
                  </button>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}