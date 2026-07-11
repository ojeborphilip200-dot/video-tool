"use client";

import { useState } from "react";
import ClipTimeline from "./components/ClipTimeline";

type MediaItem = {
  id: string;
  kind: "video" | "image";
  thumbnail: string;
  previewUrl: string;
  duration: number;
  source: "pexels" | "pixabay";
};

type SelectedClip = {
  media: MediaItem;
  trimStart: number;
  trimEnd: number;
};

type Beat = {
  text: string;
  keywords: string[];
  treatment: "video" | "image";
  duration: number;
  videos?: MediaItem[];
  images?: MediaItem[];
  loadingMedia?: boolean;
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
            treatment: b.treatment || "video",
            duration: b.duration,
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

  async function handleFindMedia(index: number) {
    setBeats((prev) =>
      prev.map((b, i) => (i === index ? { ...b, loadingMedia: true } : b))
    );

    const beat = beats[index];
    const query = beat.keywords.length > 0 ? beat.keywords.join(" ") : beat.text;

    const res = await fetch("/api/footage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, beatText: beat.text, keywords: beat.keywords }),
    });

    const data = await res.json();

    setBeats((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b;

        const videos: MediaItem[] = data.videos || [];
        const images: MediaItem[] = data.images || [];

        // AI pre-pick: auto-select the first result matching the beat's treatment
        let selectedClips = b.selectedClips;
        if (selectedClips.length === 0) {
          const preferred = b.treatment === "image" ? images[0] : videos[0];
          const fallback = b.treatment === "image" ? videos[0] : images[0];
          const pick = preferred || fallback;
          if (pick) {
            const trimEnd =
              pick.kind === "image"
                ? b.duration
                : Math.min(pick.duration, b.duration);
            selectedClips = [{ media: pick, trimStart: 0, trimEnd }];
          }
        }

        return { ...b, videos, images, loadingMedia: false, selectedClips };
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
          media.kind === "image" ? remaining : Math.min(media.duration, remaining);
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

    const formData = new FormData();
    formData.append("clips", JSON.stringify(clips));
    formData.append("script", script);
    formData.append("words", JSON.stringify(captionsEnabled ? words : []));
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

    setRendering(false);

    if (!res.ok) {
      const data = await res.json();
      alert("Error: " + (data.error || "Rendering failed"));
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setRenderedVideoUrl(url);
  }

  return (
    <div className="app-shell">
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 12px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#9295a0", margin: 0 }}>
              BEATS ({beats.length})
            </h2>
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

                <button
                  onClick={() => handleFindMedia(i)}
                  disabled={beat.loadingMedia}
                  className="btn btn-secondary"
                  style={{ marginTop: "12px" }}
                >
                  {beat.loadingMedia ? "Searching..." : "Generate Footage"}
                </button>

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
                          <div className="thumb-frame">
                            <img src={m.thumbnail} alt="media thumbnail" />
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
                      <p style={{ fontSize: "12px", color: "#5c5f68" }}>
                        Still image · shows for {(clip.trimEnd - clip.trimStart).toFixed(1)}s
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          <div className="render-section">
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", fontSize: "14px", color: "#9295a0" }}>
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(e) => setCaptionsEnabled(e.target.checked)}
              />
              Add captions to video
            </label>
            <button
              onClick={handleRenderVideo}
              disabled={rendering}
              className="btn btn-primary"
              style={{ width: "100%", padding: "14px", fontSize: "15px" }}
            >
              {rendering ? "Rendering video... this may take a minute" : "Render Full Video"}
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