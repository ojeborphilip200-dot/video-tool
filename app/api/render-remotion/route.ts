import { NextRequest, NextResponse } from "next/server";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  let tempOutputDir = "";
  const publicFilesToClean: string[] = [];

  try {
    const formData = await req.formData();
    const clipsJson = formData.get("clips") as string;
    const audioFile = formData.get("audio") as File | null;
    const musicFile = formData.get("music") as File | null;

    if (!clipsJson) {
      return NextResponse.json({ error: "No clips provided" }, { status: 400 });
    }

    const clips: { url: string; trimStart: number; trimEnd: number }[] = JSON.parse(clipsJson);

    if (clips.length === 0) {
      return NextResponse.json({ error: "No clips provided" }, { status: 400 });
    }

    const fps = 30;
    const totalDurationInSeconds = clips.reduce(
      (sum, c) => sum + (c.trimEnd - c.trimStart),
      0
    );
    const durationInFrames = Math.max(1, Math.round(totalDurationInSeconds * fps));

    // Save uploaded audio files into public/ so Remotion (via headless Chrome) can load them by URL
    const bundleAudioDir = path.join(process.cwd(), ".remotion-bundle", "temp-audio");
    await fs.mkdir(bundleAudioDir, { recursive: true });

    let narrationSrc: string | undefined;
    if (audioFile) {
      const buffer = Buffer.from(await audioFile.arrayBuffer());
      const filename = `${randomUUID()}${path.extname(audioFile.name || ".mp3")}`;
      const filePath = path.join(bundleAudioDir, filename);
      await fs.writeFile(filePath, buffer);
      publicFilesToClean.push(filePath);
      narrationSrc = `temp-audio/${filename}`;
    }

    let musicSrc: string | undefined;
    if (musicFile) {
      const buffer = Buffer.from(await musicFile.arrayBuffer());
      const filename = `${randomUUID()}${path.extname(musicFile.name || ".mp3")}`;
      const filePath = path.join(bundleAudioDir, filename);
      await fs.writeFile(filePath, buffer);
      publicFilesToClean.push(filePath);
      musicSrc = `temp-audio/${filename}`;
    }

    const serveUrl = path.join(process.cwd(), ".remotion-bundle");
    const inputProps = { clips, fps, narrationSrc, musicSrc };

    const composition = await selectComposition({
      serveUrl,
      id: "MainVideo",
      inputProps,
    });

    tempOutputDir = await fs.mkdtemp(path.join(os.tmpdir(), "remotion-render-"));
    const outputPath = path.join(tempOutputDir, "output.mp4");

    await renderMedia({
      composition: { ...composition, durationInFrames },
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
    });

    const videoBuffer = await fs.readFile(outputPath);

    return new NextResponse(videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "attachment; filename=final-video-remotion.mp4",
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (tempOutputDir) {
      await fs.rm(tempOutputDir, { recursive: true, force: true }).catch(() => {});
    }
    for (const filePath of publicFilesToClean) {
      await fs.unlink(filePath).catch(() => {});
    }
  }
}