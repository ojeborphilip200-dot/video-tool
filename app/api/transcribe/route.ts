import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    const words = (transcription as any).words || [];

    return NextResponse.json({ text: transcription.text, words });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}