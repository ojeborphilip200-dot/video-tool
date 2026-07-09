"use client";

import { useState } from "react";
import ClipTimeline from "./components/ClipTimeline";

type Video = {
  id: number;
  thumbnail: string;
  previewUrl: string;
  duration: number;
};

type Beat = {
  text: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  videos?: Video[];
  loadingVideos?: boolean;
};

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

    return sentences.map((s) => {
      const duration = estimateDuration(s);
      return { text: s, duration, trimStart: 0, trimEnd: duration };
    });
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

  function updateTrim(index: number, field: "trimStart" | "trimEnd", value: number) {
    setBeats((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b))
    );
  }

  async function handleRenderVideo() {
    const clips = beats
      .filter((b) => b.videos && b.videos.length > 0)
      .map((b) => ({
        url: b.videos![0].previewUrl,
        trimStart: b.trimStart,
        trimEnd: b.trimEnd,
      }));

    if (clips.length === 0) {
      alert("Generate footage for at least one beat first.");
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
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#9295a0", margin: "24px 0 12px" }}>
            BEATS ({beats.length})
          </h2>

          {beats.map((beat, i) => (
            <div className="card" key={i}>
              <span className="chip chip-video">BEAT {i + 1} · {beat.duration.toFixed(1)}S</span>
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
                <>
                  <div className="thumb-row">
                    {beat.videos.map((v) => (
                      <div key={v.id} className="thumb">
                        <img src={v.thumbnail} alt="clip thumbnail" width={110} />
                        <div className="thumb-label">{v.duration}s</div>
                      </div>
                    ))}
                  </div>

                  <ClipTimeline
                    totalDuration={beat.videos[0].duration}
                    trimStart={beat.trimStart}
                    trimEnd={beat.trimEnd}
                    onChange={(start, end) => {
                      updateTrim(i, "trimStart", start);
                      updateTrim(i, "trimEnd", end);
                    }}
                  />
                </>
              )}

              {beat.videos && beat.videos.length === 0 && (
                <p className="empty-note">No footage found.</p>
              )}
            </div>
          ))}

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