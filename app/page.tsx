"use client";

import { useState } from "react";

export default function Home() {
  const [script, setScript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setTranscribing(true);
    setTranscript("");

    const formData = new FormData();
    formData.append("audio", file);

    const res = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setTranscribing(false);

    if (data.text) {
      setTranscript(data.text);
      setScript(data.text);
    } else {
      setTranscript("Error: " + (data.error || "Something went wrong"));
    }
  }

  return (
    <main style={{ padding: "40px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>My Video Tool</h1>

      <p>Upload a voiceover file (mp3/wav) to auto-transcribe:</p>
      <input type="file" accept="audio/*" onChange={handleFileUpload} />
      {transcribing && <p>Transcribing... this may take a moment.</p>}
      {transcript && (
        <div>
          <h3>Transcript result:</h3>
          <p>{transcript}</p>
        </div>
      )}

      <p style={{ marginTop: "20px" }}>Or paste/edit your script directly below:</p>
      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={8}
        style={{ width: "100%", padding: "10px", fontSize: "16px" }}
        placeholder="Paste your script here..."
      />

      <h2>Preview:</h2>
      <p>{script || "Nothing typed yet."}</p>
    </main>
  );
}