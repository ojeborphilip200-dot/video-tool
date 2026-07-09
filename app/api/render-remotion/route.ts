import { NextRequest, NextResponse } from "next/server";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import os from "os";

export async function POST(req: NextRequest) {
  let tempOutputDir = "";

  try {
    const body = await req.json();
    const clips: { url: string; trimStart: number; trimEnd: number }[] = body.clips;

    if (!clips || clips.length === 0) {
      return NextResponse.json({ error: "No clips provided" }, { status: 400 });
    }

    const fps = 30;
    const totalDurationInSeconds = clips.reduce(
      (sum, c) => sum + (c.trimEnd - c.trimStart),
      0
    );
    const durationInFrames = Math.max(1, Math.round(totalDurationInSeconds * fps));

    const serveUrl = path.join(process.cwd(), ".remotion-bundle");

    const composition = await selectComposition({
      serveUrl,
      id: "MainVideo",
      inputProps: { clips, fps },
    });

    tempOutputDir = await fs.mkdtemp(path.join(os.tmpdir(), "remotion-render-"));
    const outputPath = path.join(tempOutputDir, "output.mp4");

    await renderMedia({
      composition: { ...composition, durationInFrames },
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: { clips, fps },
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
  }
}