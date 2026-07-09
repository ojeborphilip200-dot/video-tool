"use client";

import { useState } from "react";
import ClipTimeline from "./components/ClipTimeline";

type Video = {
  id: string;
  thumbnail: string;
  previewUrl: string;
  duration: number;
  source: "pexels" | "pixabay";
};

type SelectedClip = {
  video: Video;
  trimStart: number;
  trimEnd: number;
};

type Beat = {
  text: string;
  duration: number;
  videos?: Video[];
  loadingVideos?: boolean;
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
  const [beats, setBeats] = useState<Beat[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

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
    } else {
      alert("Error: " + (data.error || "Something went wrong"));
    }
  }

  function estimateDuration(text: string): number {
    const wordCount = text.trim().split(/\s+/).length;
    const wordsPerSecond = 2.5;
    return Math.max(2, wordCount / wordsPerSecond);
  }

  function splitBySentence(text: string): Beat[] {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return sentences.map((s) => ({
      text: s,
      duration: estimateDuration(s),
      selectedClips: [],
    }));
  }

  function handleSegment() {
    setBeats(splitBySentence(script));
    setRenderedVideoUrl("");
  }

  async function handleFindFootage(index: number) {
    setBeats((prev) =>
      prev.map((b, i) => (i === index ? { ...b, loadingVideos: true } : b))
    );

    const beatText = beats[index].text;

    const res = await fetch("/api/footage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: beatText }),
    });

    const data = await res.json();

    setBeats((prev) =>
      prev.map((b, i) =>
        i === index
          ? { ...b, videos: data.videos || [], loadingVideos: false }
          : b
      )
    );

    if (data.error) {
      alert("Error: " + data.error);
    }
  }

  async function handleFindAllFootage() {
    for (let i = 0; i < beats.length; i++) {
      await handleFindFootage(i);
    }
  }

  function toggleSelectVideo(beatIndex: number, video: Video) {
    setBeats((prev) =>
      prev.map((b, i) => {
        if (i !== beatIndex) return b;

        const alreadySelected = b.selectedClips.some((c) => c.video.id === video.id);

        if (alreadySelected) {
          return {
            ...b,
            selectedClips: b.selectedClips.filter((c) => c.video.id !== video.id),
          };
        }

        const remaining = remainingTime(b);
        if (remaining <= 0) return b;

        const trimEnd = Math.min(video.duration, remaining);
        return {
          ...b,
          selectedClips: [...b.selectedClips, { video, trimStart: 0, trimEnd }],
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
            c.video.id === clipId ? { ...c, trimStart: start, trimEnd: end } : c
          ),
        };
      })
    );
  }

  async function handleRenderVideo() {
    const clips = beats.flatMap((b) =>
      b.selectedClips.map((c) => ({
        url: c.video.previewUrl,
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
    if (audioFile) {
      formData.append("audio", audioFile);
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
          disabled={!script}
          className="btn btn-primary"
          style={{ marginTop: "14px" }}
        >
          Break into sentences
        </button>
      </div>

      {beats.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 12px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#9295a0", margin: 0 }}>
              BEATS ({beats.length})
            </h2>
            <button
              onClick={handleFindAllFootage}
              className="btn btn-secondary"
              style={{ fontSize: "13px", padding: "8px 16px" }}
            >
              Generate All Footage
            </button>
          </div>

          {beats.map((beat, i) => {
            const remaining = remainingTime(beat);
            return (
              <div className="card" key={i}>
                <span className="chip chip-video">
                  BEAT {i + 1} · {beat.duration.toFixed(1)}S · {remaining.toFixed(1)}S LEFT
                </span>
                <p className="beat-text">{beat.text}</p>

                <button
                  onClick={() => handleFindFootage(i)}
                  disabled={beat.loadingVideos}
                  className="btn btn-secondary"
                  style={{ marginTop: "12px" }}
                >
                  {beat.loadingVideos ? "Searching..." : "Generate Footage"}
                </button>

                {beat.videos && beat.videos.length > 0 && (
                  <div className="thumb-row">
                    {beat.videos.map((v) => {
                      const isSelected = beat.selectedClips.some((c) => c.video.id === v.id);
                      const disabled = !isSelected && remaining <= 0;
                      return (
                        <div
                          key={v.id}
                          className="thumb"
                          onClick={() => !disabled && toggleSelectVideo(i, v)}
                          style={{
                            cursor: disabled ? "not-allowed" : "pointer",
                            opacity: disabled ? 0.35 : 1,
                            outline: isSelected ? "2px solid var(--accent-blue)" : "none",
                            outlineOffset: "1px",
                          }}
                        >
                          <div className="thumb-frame">
                            <img src={v.thumbnail} alt="clip thumbnail" />
                          </div>
                          <div className="thumb-label">
                            {isSelected ? "✓ selected" : `${v.duration}s`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {beat.videos && beat.videos.length === 0 && (
                  <p className="empty-note">No footage found.</p>
                )}

                {beat.selectedClips.map((clip) => (
                  <div key={clip.video.id} style={{ marginTop: "10px" }}>
                    <p style={{ fontSize: "12px", color: "#8a8d96", margin: "0 0 4px" }}>
                      Selected clip ({clip.video.source})
                    </p>
                    <ClipTimeline
                      totalDuration={clip.video.duration}
                      trimStart={clip.trimStart}
                      trimEnd={clip.trimEnd}
                      onChange={(start, end) => updateClipTrim(i, clip.video.id, start, end)}
                    />
                  </div>
                ))}
              </div>
            );
          })}

          <div className="render-section">
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