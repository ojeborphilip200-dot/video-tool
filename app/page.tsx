"use client";

import { useState } from "react";

type Video = {
  id: number;
  thumbnail: string;
  previewUrl: string;
  duration: number;
};

type Beat = {
  text: string;
  videos?: Video[];
  loadingVideos?: boolean;
};

export default function Home() {
  const [script, setScript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [beats, setBeats] = useState<Beat[]>([]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

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

  function splitBySentence(text: string): Beat[] {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return sentences.map((s) => ({ text: s }));
  }

  function handleSegment() {
    setBeats(splitBySentence(script));
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

  return (
    <main style={{ padding: "40px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>My Video Tool</h1>

      <p>Upload a voiceover file (mp3/wav) to auto-transcribe:</p>
      <input type="file" accept="audio/*" onChange={handleFileUpload} />
      {transcribing && <p>Transcribing... this may take a moment.</p>}

      <p style={{ marginTop: "20px" }}>Or paste/edit your script directly below:</p>
      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={8}
        style={{ width: "100%", padding: "10px", fontSize: "16px" }}
        placeholder="Paste your script here..."
      />

      <button
        onClick={handleSegment}
        disabled={!script}
        style={{ marginTop: "10px", padding: "10px 20px", fontSize: "16px" }}
      >
        Break into sentences
      </button>

      {beats.length > 0 && (
        <div style={{ marginTop: "30px" }}>
          <h2>Beats ({beats.length}):</h2>
          {beats.map((beat, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "10px",
              }}
            >
              <p><strong>Beat {i + 1}:</strong> {beat.text}</p>

              <button
                onClick={() => handleFindFootage(i)}
                disabled={beat.loadingVideos}
                style={{ padding: "6px 12px", marginTop: "6px" }}
              >
                {beat.loadingVideos ? "Searching..." : "Generate Footage"}
              </button>

              {beat.videos && beat.videos.length > 0 && (
                <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                  {beat.videos.map((v) => (
                    <div key={v.id} style={{ textAlign: "center" }}>
                      <img src={v.thumbnail} alt="clip thumbnail" width={120} />
                      <p style={{ fontSize: "12px" }}>{v.duration}s</p>
                    </div>
                  ))}
                </div>
              )}

              {beat.videos && beat.videos.length === 0 && (
                <p style={{ color: "#999" }}>No footage found.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}