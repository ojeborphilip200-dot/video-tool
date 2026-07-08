"use client";

import { useState } from "react";

export default function Home() {
  const [script, setScript] = useState("");

  return (
    <main style={{ padding: "40px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>My Video Tool</h1>
      <p>Paste your script below:</p>

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