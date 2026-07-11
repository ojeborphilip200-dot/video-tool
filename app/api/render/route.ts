import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { generateAss, Callout } from "../_lib/ass";
import { detectYearCallouts, detectLocationCallouts } from "../_lib/captions";
import { getCachedMedia } from "../_lib/cache";

const execAsync = promisify(exec);


// Ken Burns: animates a virtual camera over a still image.
// Upscales first to avoid zoompan jitter, crops to 16:9, then applies a random motion.
function kenBurnsFilter(durationSec: number): string {
  const FPS = 25;
  const frames = Math.max(1, Math.round(durationSec * FPS));
  const pre = `scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440`;

  const variants = [
    `zoompan=z='min(zoom+0.0010,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
    `zoompan=z='if(eq(on,0),1.25,max(zoom-0.0010,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
    `zoompan=z='1.15':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
  ];

  const pick = variants[Math.floor(Math.random() * variants.length)];
  return `${pre},${pick},setsar=1`;
}

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

    const clips: { url: string; kind?: "video" | "image"; trimStart: number; trimEnd: number }[] = JSON.parse(clipsJson);
    const words: { word: string; start: number; end: number }[] = wordsJson
      ? JSON.parse(wordsJson)
      : [];

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-tool-"));
    const downloadedFiles: string[] = [];

    for (let i = 0; i < clips.length; i++) {
      const cachedPath = await getCachedMedia(clips[i].url, clips[i].kind || "video");
      downloadedFiles.push(cachedPath);
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

    const FADE_DUR = 0.5;
    const useXfade = downloadedFiles.length > 1;

    const scaleFilters = downloadedFiles
      .map((_, i) => {
        const isLast = i === downloadedFiles.length - 1;
        // Pad every clip except the last with a clone of its final frame,
        // so the crossfade overlap eats padding instead of real content
        const pad = useXfade && !isLast ? `,tpad=stop_mode=clone:stop_duration=${FADE_DUR}` : "";
        if (clips[i].kind === "image") {
          const dur = clips[i].trimEnd - clips[i].trimStart;
          return `[${i}:v:0]${kenBurnsFilter(dur)}${pad},format=yuv420p,settb=AVTB[v${i}]`;
        }
        const s = clips[i].trimStart;
        const e = clips[i].trimEnd;
        return `[${i}:v:0]trim=start=${s}:end=${e},setpts=PTS-STARTPTS${pad},format=yuv420p,settb=AVTB[v${i}]`;
      })
      .join("; ");


    // Subtitles filter goes right after concat - one filter replaces the whole old overlay chain
    const subtitlesFilter = assPath
      ? `[concatpre]subtitles='${assPath.replace(/'/g, "\\'")}'[outv]`
      : "";

    const concatLabel = assPath ? "concatpre" : "outv";

    // Assemble clips: xfade chain (crossfades) or passthrough for a single clip
    let assemblyFilter: string;
    if (!useXfade) {
      assemblyFilter = `[v0]null[${concatLabel}]`;
    } else {
      const durs = clips.map((c) => c.trimEnd - c.trimStart);
      let chain = "";
      let prev = "v0";
      let offset = 0;
      for (let i = 1; i < downloadedFiles.length; i++) {
        offset += durs[i - 1];
        const out = i === downloadedFiles.length - 1 ? concatLabel : `xf${i}`;
        chain += `[${prev}][v${i}]xfade=transition=fade:duration=${FADE_DUR}:offset=${offset.toFixed(3)}[${out}]; `;
        prev = out;
      }
      assemblyFilter = chain.trim().replace(/;$/, "");
    }

    const narrationIndex = downloadedFiles.length;
    const musicIndex = downloadedFiles.length + (audioPath ? 1 : 0);

    let audioFilter = "";
    let audioMapArgs = "";

    if (audioPath && musicPath) {
      // Auto-ducking: narration splits into a mix copy and a sidechain key;
      // music is compressed whenever the key (voice) has energy, and rises in pauses.
      audioFilter =
        `[${narrationIndex}:a:0]asplit=2[narrmix][narrkey]; ` +
        `[${musicIndex}:a:0]volume=0.55[musicpre]; ` +
        `[musicpre][narrkey]sidechaincompress=threshold=0.03:ratio=8:attack=50:release=500[ducked]; ` +
        `[narrmix][ducked]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
      audioMapArgs = `-map "[aout]"`;
    } else if (audioPath) {
      audioMapArgs = `-map ${narrationIndex}:a:0`;
    } else if (musicPath) {
      audioFilter = `[${musicIndex}:a:0]volume=0.5[aout]`;
      audioMapArgs = `-map "[aout]"`;
    }

    const filterComplex =
      `${scaleFilters}; ${assemblyFilter}` +
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