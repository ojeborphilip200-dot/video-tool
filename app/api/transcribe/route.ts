import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

const MODEL_PATH = path.join(process.cwd(), "models", "ggml-base.en.bin");

type Word = { word: string; start: number; end: number };

export async function POST(req: NextRequest) {
  let tempDir = "";

  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "whisper-"));
    const inputPath = path.join(tempDir, "input" + path.extname(file.name || ".mp3"));
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, buffer);

    // whisper-cli needs 16kHz WAV; convert whatever was uploaded first
    const wavPath = path.join(tempDir, "input.wav");
    await execAsync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`);

    const outPrefix = path.join(tempDir, "result");
    await execAsync(
      `whisper-cli -m "${MODEL_PATH}" -f "${wavPath}" -ojf -of "${outPrefix}"`,
      { maxBuffer: 1024 * 1024 * 50 }
    );

    const raw = await fs.readFile(`${outPrefix}.json`, "utf-8");
    const parsed = JSON.parse(raw);

    // Merge whisper.cpp tokens into words. Tokens starting with a space begin a new word;
    // bracketed tokens like [_BEG_] are markers, not speech.
    const words: Word[] = [];
    let fullText = "";

    for (const segment of parsed.transcription || []) {
      fullText += segment.text;

      let current: Word | null = null;
      for (const token of segment.tokens || []) {
        const t: string = token.text;
        if (t.startsWith("[") && t.endsWith("]")) continue;

        const startsNewWord = t.startsWith(" ") || current === null;

        if (startsNewWord) {
          if (current && current.word.trim()) words.push(current);
          current = {
            word: t.trim(),
            start: token.offsets.from / 1000,
            end: token.offsets.to / 1000,
          };
        } else if (current) {
          current.word += t;
          current.end = token.offsets.to / 1000;
        }
      }
      if (current && current.word.trim()) words.push(current);
    }

    return NextResponse.json({ text: fullText.trim(), words });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}