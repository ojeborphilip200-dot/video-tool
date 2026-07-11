import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { generateAss, Callout } from "../_lib/ass";
import { detectYearCallouts, detectLocationCallouts } from "../_lib/captions";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  let tempDir = "";

  try {
    const formData = await req.formData();
    const clipsJson = formData.get("clips") as string;
    const wordsJson = formData.get("words") as string | null;
    const scriptText = (formData.get("script") as string | null) || "";
    const audioFile = formData.get("audio") as File | null;
    const musicFile = formData.get("music") as File | null;

    if (!clipsJson) {
      return NextResponse.json({ error: "No videos provided" }, { status: 400 });
    }

    const clips: { url: string; trimStart: number; trimEnd: number }[] = JSON.parse(clipsJson);
    const words: { word: string; start: number; end: number }[] = wordsJson
      ? JSON.parse(wordsJson)
      : [];

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

    let musicPath = "";
    if (musicFile) {
      const musicBuffer = Buffer.from(await musicFile.arrayBuffer());
      musicPath = path.join(tempDir, "music" + path.extname(musicFile.name || ".mp3"));
      await fs.writeFile(musicPath, musicBuffer);
    }

    const outputPath = path.join(tempDir, "output.mp4");

    const TARGET_WIDTH = 1280;
    const TARGET_HEIGHT = 720;

    // Build ASS subtitle file (captions + callouts) if we have word timings
    let assPath = "";
    if (words.length > 0) {
      let callouts: Callout[] = detectYearCallouts(words);
      if (scriptText) {
        const locationCallouts = await detectLocationCallouts(scriptText, words);
        callouts = [...callouts, ...locationCallouts];
      }
      const assContent = generateAss(words, callouts, 5, TARGET_WIDTH, TARGET_HEIGHT);
      assPath = path.join(tempDir, "subs.ass");
      await fs.writeFile(assPath, assContent);
      console.log(`DEBUG - ASS file written with ${words.length} words, ${callouts.length} callouts`);
    }

    const videoInputs = downloadedFiles.map((f) => `-i "${f}"`).join(" ");
    const audioInput = audioPath ? `-i "${audioPath}"` : "";
    const musicInput = musicPath ? `-stream_loop -1 -i "${musicPath}"` : "";

    const scaleFilters = downloadedFiles
      .map((_, i) => {
        const start = clips[i].trimStart;
        const end = clips[i].trimEnd;
        return `[${i}:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`;
      })
      .join("; ");

    const concatInputs = downloadedFiles.map((_, i) => `[v${i}]`).join("");

    // Subtitles filter goes right after concat - one filter replaces the whole old overlay chain
    const subtitlesFilter = assPath
      ? `[concatpre]subtitles='${assPath.replace(/'/g, "\\'")}'[outv]`
      : "";

    const concatLabel = assPath ? "concatpre" : "outv";

    const narrationIndex = downloadedFiles.length;
    const musicIndex = downloadedFiles.length + (audioPath ? 1 : 0);

    let audioFilter = "";
    let audioMapArgs = "";

    if (audioPath && musicPath) {
      audioFilter = `[${narrationIndex}:a:0]volume=1.0[narr]; [${musicIndex}:a:0]volume=0.18[musicvol]; [narr][musicvol]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
      audioMapArgs = `-map "[aout]"`;
    } else if (audioPath) {
      audioMapArgs = `-map ${narrationIndex}:a:0`;
    } else if (musicPath) {
      audioFilter = `[${musicIndex}:a:0]volume=0.5[aout]`;
      audioMapArgs = `-map "[aout]"`;
    }

    const filterComplex =
      `${scaleFilters}; ${concatInputs}concat=n=${downloadedFiles.length}:v=1:a=0[${concatLabel}]` +
      (subtitlesFilter ? `; ${subtitlesFilter}` : "") +
      (audioFilter ? `; ${audioFilter}` : "");

    const hasAudio = Boolean(audioPath || musicPath);

    let cmd: string;

    if (hasAudio) {
      cmd = `ffmpeg -y ${videoInputs} ${audioInput} ${musicInput} -filter_complex "${filterComplex}" -map "[outv]" ${audioMapArgs} -c:v libx264 -c:a aac -shortest "${outputPath}"`;
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