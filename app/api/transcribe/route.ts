import { NextRequest, NextResponse } from "next/server";

type Word = { word: string; start: number; end: number };

// Turbo is ~3x cheaper than the full model with only marginal accuracy loss -
// fine for narration scripts the user wrote and is reading aloud themselves.
const GROQ_MODEL = "whisper-large-v3-turbo";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not set in .env.local" },
        { status: 500 }
      );
    }

    const groqForm = new FormData();
    groqForm.append("file", file, file.name || "audio.mp3");
    groqForm.append("model", GROQ_MODEL);
    groqForm.append("response_format", "verbose_json");
    groqForm.append("timestamp_granularities[]", "word");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq transcription failed (${res.status}): ${errText}`);
    }

    const data = await res.json();

    const words: Word[] = (data.words || []).map((w: any) => ({
      word: String(w.word).trim(),
      start: w.start,
      end: w.end,
    }));

    return NextResponse.json({ text: (data.text || "").trim(), words });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
