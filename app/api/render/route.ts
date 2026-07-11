import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { generateAss, Callout } from "../_lib/ass";
import { detectYearCallouts, detectLocationCallouts } from "../_lib/captions";
import { getCachedMedia } from "../_lib/cache";
import { createJob, updateJob } from "../_lib/jobs";

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

type RenderInput = {
  clips: { url: string; kind?: "video" | "image"; trimStart: number; trimEnd: number }[];
  words: { word: string; start: number; end: number }[];
  scriptText: string;
  audioBuffer: Buffer | null;
  audioName: string;
  musicBuffer: Buffer | null;
  musicName: string;
};

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const clipsJson = formData.get("clips") as string;
  const wordsJson = formData.get("words") as string | null;
  const scriptText = (formData.get("script") as string | null) || "";
  const audioFile = formData.get("audio") as File | null;
  const musicFile = formData.get("music") as File | null;

  if (!clipsJson) {
    return NextResponse.json({ error: "No videos provided" }, { status: 400 });
  }

  const input: RenderInput = {
    clips: JSON.parse(clipsJson),
    words: wordsJson ? JSON.parse(wordsJson) : [],
    scriptText,
    audioBuffer: audioFile ? Buffer.from(await audioFile.arrayBuffer()) : null,
    audioName: audioFile?.name || "narration.mp3",
    musicBuffer: musicFile ? Buffer.from(await musicFile.arrayBuffer()) : null,
    musicName: musicFile?.name || "music.mp3",
  };

  const job = createJob();
  void runRenderJob(job.id, input);
  return NextResponse.json({ jobId: job.id });
}

async function runRenderJob(jobId: string, input: RenderInput) {
  let tempDir = "";

  try {
    updateJob(jobId, { status: "processing", progress: 3, message: "Starting render" });
    const { clips, words, scriptText } = input;

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-tool-"));
    const downloadedFiles: string[] = [];

    for (let i = 0; i < clips.length; i++) {
      updateJob(jobId, {
        progress: 5 + Math.round((i / clips.length) * 35),
        message: `Fetching media ${i + 1}/${clips.length}`,
      });
      const cachedPath = await getCachedMedia(clips[i].url, clips[i].kind || "video");
      downloadedFiles.push(cachedPath);
      // DEBUG: compare assumed trim window vs the file's real duration
      try {
        const { stdout } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of csv=p=0 "${cachedPath}"`
        );
        console.log(
          `DEBUG clip ${i}: kind=${clips[i].kind} trim=${clips[i].trimStart}-${clips[i].trimEnd} ` +
          `(want ${(clips[i].trimEnd - clips[i].trimStart).toFixed(2)}s) actualFile=${stdout.trim()}s`
        );
      } catch {
        console.log(`DEBUG clip ${i}: probe failed for ${cachedPath}`);
      }
    }

    let audioPath = "";
    if (input.audioBuffer) {
      audioPath = path.join(tempDir, "narration" + path.extname(input.audioName));
      await fs.writeFile(audioPath, input.audioBuffer);
    }

    let musicPath = "";
    if (input.musicBuffer) {
      musicPath = path.join(tempDir, "music" + path.extname(input.musicName));
      await fs.writeFile(musicPath, input.musicBuffer);
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
    // Crossfades disabled: xfade drops frames with mixed image/video inputs.
    // Flip to true to re-enable once that bug is solved.
    const ENABLE_CROSSFADES = false;
    const useXfade = ENABLE_CROSSFADES && downloadedFiles.length > 1;

    // Ensure the video covers the full narration: if selected clips total less
    // than the audio length, extend the last clip by holding its final frame.
    let lastClipExtraPad = 0;
    if (audioPath) {
      try {
        // Fully decode for an exact duration - MP3 header estimates can be seconds off
        const { stdout: probeOut, stderr: probeErr } = await execAsync(
          `ffmpeg -i "${audioPath}" -f null - 2>&1 | tail -5`,
          { shell: "/bin/bash", maxBuffer: 1024 * 1024 * 10 }
        );
        const m = String(probeOut || probeErr || "").match(/time=(\d+):(\d+):(\d+\.?\d*)/g);
        let audioDur = NaN;
        if (m && m.length > 0) {
          const last = m[m.length - 1].replace("time=", "").split(":");
          audioDur = parseInt(last[0]) * 3600 + parseInt(last[1]) * 60 + parseFloat(last[2]);
        }
        const totalVideo = clips.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0);
        if (!isNaN(audioDur) && audioDur > totalVideo + 0.05) {
          lastClipExtraPad = audioDur - totalVideo;
          console.log(`DEBUG - padding last clip by ${lastClipExtraPad.toFixed(2)}s to cover narration`);
        } else {
          console.log(`DEBUG - no padding needed: audioDur=${audioDur}, totalVideo=${totalVideo.toFixed(2)}`);
        }
      } catch (e) {
        console.error("DEBUG - audio probe failed:", e);
      }
    }

    const scaleFilters = downloadedFiles
      .map((_, i) => {
        const isLast = i === downloadedFiles.length - 1;
        // Pad every clip except the last with a clone of its final frame,
        // so the crossfade overlap eats padding instead of real content
        const padDur = isLast ? lastClipExtraPad : useXfade ? FADE_DUR : 0;
        const pad = padDur > 0 ? `,tpad=stop_mode=clone:stop_duration=${padDur.toFixed(3)}` : "";
        if (clips[i].kind === "image") {
          const dur = clips[i].trimEnd - clips[i].trimStart;
          return `[${i}:v:0]${kenBurnsFilter(dur)}${pad},format=yuv420p,fps=25,settb=AVTB[v${i}]`;
        }
        const s = clips[i].trimStart;
        const e = clips[i].trimEnd;
        return `[${i}:v:0]trim=start=${s}:end=${e},setpts=PTS-STARTPTS${pad},format=yuv420p,fps=25,settb=AVTB[v${i}]`;
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
      if (downloadedFiles.length === 1) {
        assemblyFilter = `[v0]null[${concatLabel}]`;
      } else {
        const concatInputs = downloadedFiles.map((_, i) => `[v${i}]`).join("");
        assemblyFilter = `${concatInputs}concat=n=${downloadedFiles.length}:v=1:a=0[${concatLabel}]`;
      }
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

    updateJob(jobId, { progress: 45, message: "Rendering video with FFmpeg" });
    await fs.writeFile(path.join(process.cwd(), "last-render-cmd.txt"), cmd);
    const renderResult = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });
    const errTail = String(renderResult.stderr || "").split("\n").slice(-25).join("\n");
    console.log("DEBUG - ffmpeg stderr tail:\n" + errTail);

    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`
      );
      console.log(`DEBUG - rendered output duration: ${stdout.trim()}s`);
    } catch {
      console.log("DEBUG - output probe failed");
    }

    const outDir = path.join(process.cwd(), ".render-output");
    await fs.mkdir(outDir, { recursive: true });
    const finalPath = path.join(outDir, `${jobId}.mp4`);
    await fs.copyFile(outputPath, finalPath);

    updateJob(jobId, { status: "done", progress: 100, message: "Done", outputPath: finalPath });
  } catch (err: any) {
    console.error(err);
    updateJob(jobId, { status: "error", error: err.message, message: "Render failed" });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}