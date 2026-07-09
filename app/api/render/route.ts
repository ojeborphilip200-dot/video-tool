import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  let tempDir = "";

  try {
   const formData = await req.formData();
    const clipsJson = formData.get("clips") as string;
    const audioFile = formData.get("audio") as File | null;

    if (!clipsJson) {
      return NextResponse.json({ error: "No videos provided" }, { status: 400 });
    }

    const clips: { url: string; duration: number }[] = JSON.parse(clipsJson);

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-tool-"));
    const downloadedFiles: string[] = [];

    for (let i = 0; i < clips.length; i++) {
      const res = await fetch(clips[i].url);
      const buffer = Buffer.from(await res.arrayBuffer());
      const filePath = path.join(tempDir, `clip-${i}.mp4`);
      await fs.writeFile(filePath, buffer);
      downloadedFiles.push(filePath);
    }

    let audioPath = "";
    if (audioFile) {
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      audioPath = path.join(tempDir, "narration" + path.extname(audioFile.name || ".mp3"));
      await fs.writeFile(audioPath, audioBuffer);
    }

    const outputPath = path.join(tempDir, "output.mp4");

    const TARGET_WIDTH = 1280;
    const TARGET_HEIGHT = 720;

    const videoInputs = downloadedFiles.map((f) => `-i "${f}"`).join(" ");
    const audioInput = audioPath ? `-i "${audioPath}"` : "";

    const scaleFilters = downloadedFiles
      .map(
        (_, i) =>
          `[${i}:v:0]trim=duration=${clips[i].duration},scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`
      )
      .join("; ");

    const concatInputs = downloadedFiles.map((_, i) => `[v${i}]`).join("");
    const filterComplex = `${scaleFilters}; ${concatInputs}concat=n=${downloadedFiles.length}:v=1:a=0[outv]`;

    let cmd: string;

    if (audioPath) {
      const audioIndex = downloadedFiles.length;
      cmd = `ffmpeg -y ${videoInputs} ${audioInput} -filter_complex "${filterComplex}" -map "[outv]" -map ${audioIndex}:a:0 -c:v libx264 -c:a aac -shortest "${outputPath}"`;
    } else {
      cmd = `ffmpeg -y ${videoInputs} -filter_complex "${filterComplex}" -map "[outv]" -c:v libx264 "${outputPath}"`;
    }

    await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });

    const videoBuffer = await fs.readFile(outputPath);

    return new NextResponse(videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "attachment; filename=final-video.mp4",
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}