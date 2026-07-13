import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { generateAss, Callout } from "../_lib/ass";
import { detectYearCallouts, detectLocationCallouts } from "../_lib/captions";
import { detectCountups, CountupSpec } from "../_lib/countups";
import { buildTextOverlay } from "../_lib/hfOverlays";
import { buildImageSequenceClip } from "../_lib/slideshow";
import { getCachedMedia } from "../_lib/cache";
import { createJob, updateJob } from "../_lib/jobs";

const execAsync = promisify(exec);


// Ken Burns: animates a virtual camera over a still image.
// Upscales first to avoid zoompan jitter, crops to 16:9, then applies a random motion.
function kenBurnsFilter(durationSec: number): string {
  const FPS = 25;
  const frames = Math.max(1, Math.round(durationSec * FPS));
  const pre = `scale=w='if(lt(a,1),-2,if(lt(a,16/9),2560,-2))':h='if(lt(a,1),1309,if(lt(a,16/9),-2,1440))',crop=w='min(2560,iw)':h='min(1440,ih)',pad=2560:1440:(ow-iw)/2:(oh-ih)/2:color=white`;

  const variants = [
    `zoompan=z='min(zoom+0.0005,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
    `zoompan=z='if(eq(on,0),1.10,max(zoom-0.0005,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
    `zoompan=z='1.10':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
  ];

  const pick = variants[Math.floor(Math.random() * variants.length)];
  return `${pre},${pick},setsar=1`;
}

// Picks background-frame beats: ONLY beats whose footage is all images
// (video never plays inside the frame), restricted to the middle-to-near-end
// stretch, never the opening, never the final beat, never consecutive -
// delivering the promised count whenever enough eligible beats exist.
function pickBackgroundWindows(
  windows: { start: number; end: number; imagesOnly?: boolean }[],
  frequency: string = "2-3"
): { start: number; end: number }[] {
  // "always" = frame the whole video: no windows means the full-video compositing path
  if (frequency === "always") return [];

  const n = windows.length;
  if (n < 4) return [];

  const lo = Math.max(1, Math.floor(n / 2));
  const hi = n - 2; // exclude the final beat
  if (hi < lo) return [];

  // Eligible = image-only beats in the allowed stretch (missing flag = eligible,
  // for payloads that predate the flag)
  const eligible: number[] = [];
  for (let i = lo; i <= hi; i++) {
    if (windows[i].imagesOnly !== false) eligible.push(i);
  }
  if (eligible.length === 0) {
    console.log("DEBUG - background frames: no image-only beats in the eligible stretch, skipping");
    return [];
  }

  const desired =
    frequency === "3-5"
      ? 3 + Math.floor(Math.random() * 3) // 3, 4, or 5
      : 2 + (Math.random() < 0.5 ? 1 : 0); // 2 or 3
  const count = Math.min(desired, Math.ceil(eligible.length / 2) + (eligible.length % 2 === 0 ? 0 : 0), eligible.length);

  const chosen: number[] = [];

  // Pass 1: spread across the eligible list, skipping picks adjacent in the video
  const sectionSize = eligible.length / count;
  for (let s = 0; s < count; s++) {
    let k = Math.floor((s + 0.2 + Math.random() * 0.6) * sectionSize);
    k = Math.max(0, Math.min(eligible.length - 1, k));
    let idx = eligible[k];
    if (chosen.length > 0 && Math.abs(idx - chosen[chosen.length - 1]) < 2) {
      const next = eligible.find((e) => e > chosen[chosen.length - 1] + 1);
      if (next === undefined) continue;
      idx = next;
    }
    if (!chosen.includes(idx)) chosen.push(idx);
  }

  // Pass 2 (guarantee): fill any shortfall from remaining eligible slots
  if (chosen.length < count) {
    for (const idx of eligible) {
      if (chosen.length >= count) break;
      if (chosen.every((c) => Math.abs(c - idx) >= 2)) chosen.push(idx);
    }
  }
  chosen.sort((a, b) => a - b);

  console.log(
    `DEBUG - background frames: requested ${frequency} (target ${desired}), ${eligible.length} image-only candidates, delivering ${chosen.length}`
  );

  return chosen.map((i) => windows[i]);
}

const BG_PRESETS: Record<string, { input: string; filter: string }> = {
  black: { input: "color=c=black:s=1280x720:r=25", filter: "null" },
  grid: { input: "color=c=0x0d0e12:s=1280x720:r=25", filter: "drawgrid=w=40:h=40:t=1:color=0x2a2c32" },
  "blue-gradient": { input: "gradients=s=1280x720:c0=0x1a2c5b:c1=0x05070d", filter: "null" },
  "green-gradient": { input: "gradients=s=1280x720:c0=0x14532d:c1=0x04100a", filter: "null" },
  vintage: { input: "gradients=s=1280x720:c0=0xe8dfc8:c1=0xc9bfa5", filter: "null" },
};

type RenderInput = {
  clips: { url: string; kind?: "video" | "image"; trimStart: number; trimEnd: number }[];
  words: { word: string; start: number; end: number }[];
  scriptText: string;
  audioBuffer: Buffer | null;
  audioName: string;
  musicBuffer: Buffer | null;
  musicName: string;
  background: string;
  bgFrequency: string;
  textStyle: string;
  captionsEnabled: boolean;
  calloutsEnabled: boolean;
  countupLevel: string;
  beatWindows: { start: number; end: number; imagesOnly?: boolean }[];
  textEventsOverride: { callouts: Callout[]; countups: CountupSpec[] } | null;
  sfxShutter: boolean;
  sfxCountup: boolean;
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
    background: (formData.get("background") as string | null) || "none",
    bgFrequency: (formData.get("bgFrequency") as string | null) || "2-3",
    textStyle: (formData.get("textStyle") as string | null) || "standard",
    captionsEnabled: (formData.get("captionsEnabled") as string | null) !== "false",
    calloutsEnabled: (formData.get("calloutsEnabled") as string | null) !== "false",
    countupLevel: (formData.get("countupLevel") as string | null) || "medium",
    beatWindows: JSON.parse((formData.get("beatWindows") as string | null) || "[]"),
    textEventsOverride: JSON.parse((formData.get("textEvents") as string | null) || "null"),
    sfxShutter: (formData.get("sfxShutter") as string | null) !== "false",
    sfxCountup: (formData.get("sfxCountup") as string | null) !== "false",
  };

  const job = createJob();
  void runRenderJob(job.id, input);
  return NextResponse.json({ jobId: job.id });
}

async function runRenderJob(jobId: string, input: RenderInput) {
  let tempDir = "";

  try {
    updateJob(jobId, { status: "processing", progress: 3, message: "Creating" });
    const { clips, words, scriptText, background } = input;

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-tool-"));
    const downloadedFiles: string[] = [];

    for (let i = 0; i < clips.length; i++) {
      updateJob(jobId, {
        progress: 5 + Math.round((i / clips.length) * 35),
        message: "Adding Edits",
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
        // Clamp video trims to the file's real length - archive metadata can
        // over-report durations, and an out-of-range trim silently shortens
        // the whole video relative to the narration
        const actual = parseFloat(stdout.trim());
        if (clips[i].kind !== "image" && !isNaN(actual) && actual > 0) {
          if (clips[i].trimStart >= actual) {
            clips[i].trimStart = 0;
          }
          if (clips[i].trimEnd > actual) {
            console.log(`DEBUG clip ${i}: clamping trimEnd ${clips[i].trimEnd} -> ${actual}`);
            clips[i].trimEnd = actual;
          }
        }
      } catch {
        console.log(`DEBUG clip ${i}: probe failed for ${cachedPath}`);
      }
    }

    // Group runs of 2+ consecutive images into single pre-rendered slideshow
    // clips (Ken Burns + crossfades baked in) - seamless within the beat, and
    // the main pass sees one ordinary video clip instead of N images
    {
      const newClips: typeof clips = [];
      const newFiles: string[] = [];
      let gi = 0;
      while (gi < clips.length) {
        if (clips[gi].kind === "image") {
          let gj = gi;
          while (gj < clips.length && clips[gj].kind === "image") gj++;
          if (gj - gi >= 2) {
            const groupFiles = downloadedFiles.slice(gi, gj);
            const groupDurs = clips.slice(gi, gj).map((c) => c.trimEnd - c.trimStart);
            const seq = await buildImageSequenceClip(groupFiles, groupDurs);
            console.log(
              `DEBUG - image sequence: ${gj - gi} images -> ${seq.duration.toFixed(1)}s slideshow clip`
            );
            newClips.push({ url: "", kind: "video", trimStart: 0, trimEnd: seq.duration });
            newFiles.push(seq.path);
            gi = gj;
            continue;
          }
        }
        newClips.push(clips[gi]);
        newFiles.push(downloadedFiles[gi]);
        gi++;
      }
      clips.length = 0;
      clips.push(...newClips);
      downloadedFiles.length = 0;
      downloadedFiles.push(...newFiles);
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
    const wantCountups = input.countupLevel !== "off";

    let callouts: Callout[] = [];
    let countups: CountupSpec[] = [];
    if (input.textEventsOverride) {
      // The editor curated these (deletions applied) - obey, don't re-detect
      callouts = input.calloutsEnabled ? input.textEventsOverride.callouts || [] : [];
      countups = wantCountups ? input.textEventsOverride.countups || [] : [];
      console.log(`DEBUG - curated text events: ${callouts.length} callouts, ${countups.length} countups`);
    } else {
    if (words.length > 0 && input.calloutsEnabled) {
      callouts = detectYearCallouts(words);
      if (scriptText) {
        const locationCallouts = await detectLocationCallouts(scriptText, words);
        callouts = [...callouts, ...locationCallouts];
      }
    }
    if (words.length > 0 && wantCountups && scriptText) {
      try {
        countups = await detectCountups(scriptText, words, input.countupLevel);
        console.log(
          `DEBUG - countups (${input.countupLevel}): ${countups.length} -> ${countups.map((c) => `${c.phrase}@${c.land.toFixed(1)}s`).join(", ") || "none"}`
        );
      } catch (e) {
        console.error("Countup detection failed, continuing without:", e);
      }
    }
    }

    // Count-ups own their moment: drop any callout whose on-screen window
    // overlaps a count-up's window (count start through hold + fade-out)
    if (countups.length > 0 && callouts.length > 0) {
      const cuWindows = countups.map((cu) => ({
        start: cu.animStart,
        end: cu.land + 1.9,
      }));
      const before = callouts.length;
      callouts = callouts.filter((c) => {
        const cStart = c.start;
        const cEnd = c.start + Math.min(Math.max(c.end - c.start, 1.2), 5.5);
        return !cuWindows.some((w) => cStart < w.end && cEnd > w.start);
      });
      if (callouts.length < before) {
        console.log(
          `DEBUG - suppressed ${before - callouts.length} callout(s) overlapping count-up windows`
        );
      }
    }

    // Build themed HyperFrames overlay clips (cached transparent WebM per event)
    const textOverlays: { file: string; start: number }[] = [];
    const totalEvents = callouts.length + countups.length;
    let eventIdx = 0;
    // Five distinct spots, assigned round-robin - top-center stays reserved for
    // count-ups, so simultaneous events can never stack on the same pixels
    const CALLOUT_POS = ["top-left", "top-right", "mid-left", "low-center", "mid-right"];
    let posIdx = 0;
    for (const c of callouts) {
      eventIdx++;
      updateJob(jobId, { progress: 42, message: `Creating text animations ${eventIdx}/${totalEvents}` });
      try {
        const file = await buildTextOverlay("callout", {
          text: c.text,
          theme: input.textStyle,
          dur: Math.min(Math.max(c.end - c.start, 1.2), 5.5),
          pos: CALLOUT_POS[posIdx++ % CALLOUT_POS.length],
        });
        textOverlays.push({ file, start: Math.max(0, c.start - 0.25) });
      } catch (e) {
        console.error("Callout overlay failed, skipping:", e);
      }
    }
    for (const cu of countups) {
      eventIdx++;
      updateJob(jobId, { progress: 42, message: `Creating text animations ${eventIdx}/${totalEvents}` });
      try {
        const file = await buildTextOverlay("countup", {
          value: cu.value,
          prefix: cu.prefix,
          suffix: cu.suffix,
          decimals: cu.decimals,
          compact: cu.compact,
          countDur: Math.min(Math.max(cu.land - cu.animStart, 1), 5),
          hold: 1.5,
          theme: input.textStyle,
        });
        textOverlays.push({ file, start: cu.animStart });
      } catch (e) {
        console.error("Countup overlay failed, skipping:", e);
      }
    }
    if (textOverlays.length > 0) {
      console.log(`DEBUG - text overlays: ${textOverlays.length} composited via HyperFrames`);
    }

    if (words.length > 0 && input.captionsEnabled) {
      const assContent = generateAss(words, [], 5, TARGET_WIDTH, TARGET_HEIGHT, input.textStyle, []);
      assPath = path.join(tempDir, "subs.ass");
      await fs.writeFile(assPath, assContent);
      console.log(`DEBUG - ASS file written with ${words.length} words, ${callouts.length} callouts`);
    }

    const videoInputs = downloadedFiles.map((f) => `-i "${f}"`).join(" ");
    const audioInput = audioPath ? `-i "${audioPath}"` : "";
    const musicInput = musicPath ? `-stream_loop -1 -i "${musicPath}"` : "";

    const bgPreset = BG_PRESETS[background];
    const useBackground = Boolean(bgPreset);
    const bgIndex = downloadedFiles.length + (audioPath ? 1 : 0) + (musicPath ? 1 : 0);
    const bgInput = useBackground ? `-f lavfi -i "${bgPreset.input}"` : "";

    const ovBase = bgIndex + (useBackground ? 1 : 0);
    const overlayInputs = textOverlays
      .map((o) => `-c:v libvpx-vp9 -i "${o.file}"`)
      .join(" ");

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

    // Background windows hoisted: needed by both the audio SFX plan and the video bg filter
    const bgWindowsForRender = useBackground
      ? pickBackgroundWindows(input.beatWindows || [], input.bgFrequency)
      : [];

    // SFX plan: camera shutter on each background-frame snap-in, number-roll under each count-up
    type SfxEvent = { file: string; at: number; kind: "shutter" | "roll"; dur?: number };
    const sfxEvents: SfxEvent[] = [];
    const shutterPath = path.join(process.cwd(), "public", "sfx", "camera-shutter.mp3");
    const rollPath = path.join(process.cwd(), "public", "sfx", "number-roll.mp3");
    let haveShutter = false;
    let haveRoll = false;
    if (input.sfxShutter) {
      try { await fs.access(shutterPath); haveShutter = true; } catch {}
    }
    if (input.sfxCountup) {
      try { await fs.access(rollPath); haveRoll = true; } catch {}
    }
    if (haveShutter) {
      for (const w of bgWindowsForRender) sfxEvents.push({ file: shutterPath, at: w.start, kind: "shutter" });
    }
    if (haveRoll) {
      for (const cu of countups) {
        sfxEvents.push({
          file: rollPath,
          at: Math.max(0, cu.animStart - 0.25),
          kind: "roll",
          dur: Math.min(Math.max(cu.land - cu.animStart + 0.25, 1), 6),
        });
      }
    }
    const sfxBase = ovBase + textOverlays.length;
    const sfxInputs = sfxEvents.map((s) => `-i "${s.file}"`).join(" ");
    const sfxCount = sfxEvents.length;
    if (sfxCount > 0) {
      console.log(
        `DEBUG - sfx: ${sfxEvents.filter((s) => s.kind === "shutter").length} shutter, ${sfxEvents.filter((s) => s.kind === "roll").length} roll`
      );
    }

    let audioFilter = "";
    let audioMapArgs = "";

    if (audioPath && musicPath) {
      // Auto-ducking: narration splits into a mix copy and a sidechain key;
      // music is compressed whenever the key (voice) has energy, and rises in pauses.
      audioFilter =
        `[${narrationIndex}:a:0]asplit=2[narrmix][narrkey]; ` +
        `[${musicIndex}:a:0]volume=0.55[musicpre]; ` +
        `[musicpre][narrkey]sidechaincompress=threshold=0.03:ratio=8:attack=50:release=500[ducked]; ` +
        `[narrmix][ducked]amix=inputs=2:duration=first:dropout_transition=2[amain]`;
      audioMapArgs = `-map "[aout]"`;
    } else if (audioPath) {
      if (sfxCount > 0) {
        audioFilter = `[${narrationIndex}:a:0]anull[amain]`;
        audioMapArgs = `-map "[aout]"`;
      } else {
        audioMapArgs = `-map ${narrationIndex}:a:0`;
      }
    } else if (musicPath) {
      audioFilter = `[${musicIndex}:a:0]volume=0.5[amain]`;
      audioMapArgs = `-map "[aout]"`;
    }

    if (audioFilter) {
      if (sfxCount > 0) {
        const parts = sfxEvents
          .map((s, i) => {
            const ms = Math.round(s.at * 1000);
            if (s.kind === "roll") {
              const d = s.dur || 2;
              // First 3s at gentle presence, then ramp down to a whisper so the
              // roll never competes with the on-screen number or narration
              return `[${sfxBase + i}:a:0]atrim=0:${d.toFixed(2)},volume='if(lt(t,1.5),0.22,if(lt(t,2.5),0.22-0.14*(t-1.5),0.08))':eval=frame,afade=t=out:st=${Math.max(0, d - 0.45).toFixed(2)}:d=0.45,adelay=${ms}:all=1[sfx${i}]`;
            }
            return `[${sfxBase + i}:a:0]atrim=0:1.1,volume=0.35,adelay=${ms}:all=1[sfx${i}]`;
          })
          .join("; ");
        const labels = sfxEvents.map((_, i) => `[sfx${i}]`).join("");
        audioFilter += `; ${parts}; [amain]${labels}amix=inputs=${1 + sfxCount}:duration=first:normalize=0[aout]`;
      } else {
        audioFilter = audioFilter.replace("[amain]", "[aout]");
      }
    }

    let bgFilter = "";
    if (useBackground) {
      const bgWindows = bgWindowsForRender;
      assemblyFilter = assemblyFilter.replace(`[${concatLabel}]`, "[asm]");
      if (bgWindows.length === 0) {
        bgFilter = `[${bgIndex}:v]${bgPreset.filter},fps=25,settb=AVTB[bgready]; [asm]scale=1024:576,setsar=1[smallv]; [bgready][smallv]overlay=(W-w)/2:(H-h)/2:shortest=1[${concatLabel}]`;
      } else {
        const enableExpr = bgWindows
          .map((w) => `between(t,${w.start.toFixed(3)},${w.end.toFixed(3)})`)
          .join("+");
        console.log(
          `DEBUG - background frame windows: ${bgWindows.map((w) => `${w.start.toFixed(1)}s-${w.end.toFixed(1)}s`).join(", ")}`
        );
        bgFilter =
          `[asm]split=2[fullv][forsmall]; ` +
          `[forsmall]scale=1024:576,setsar=1[smallv]; ` +
          `[${bgIndex}:v]${bgPreset.filter},fps=25,settb=AVTB[bgready]; ` +
          `[bgready][smallv]overlay=(W-w)/2:(H-h)/2:shortest=1[framed]; ` +
          `[fullv][framed]overlay=0:0:enable='${enableExpr}'[${concatLabel}]`;
      }
    }

    let overlayChain = "";
    if (textOverlays.length > 0) {
      const target = `[${concatLabel}]`;
      if (bgFilter.includes(target)) {
        bgFilter = bgFilter.replace(target, "[preov]");
      } else {
        assemblyFilter = assemblyFilter.replace(target, "[preov]");
      }
      let prev = "preov";
      textOverlays.forEach((o, i) => {
        const out = i === textOverlays.length - 1 ? concatLabel : `ov${i}`;
        const s = o.start.toFixed(3);
        overlayChain += `; [${ovBase + i}:v]setpts=PTS+${s}/TB[ovsrc${i}]`;
        overlayChain += `; [${prev}][ovsrc${i}]overlay=0:0:eof_action=pass:enable='gte(t,${s})'[${out}]`;
        prev = out;
      });
    }

    const filterComplex =
      `${scaleFilters}; ${assemblyFilter}` +
      (bgFilter ? `; ${bgFilter}` : "") +
      overlayChain +
      (subtitlesFilter ? `; ${subtitlesFilter}` : "") +
      (audioFilter ? `; ${audioFilter}` : "");

    const hasAudio = Boolean(audioPath || musicPath);

    let cmd: string;

    if (hasAudio) {
      cmd = `ffmpeg -y ${videoInputs} ${audioInput} ${musicInput} ${bgInput} ${overlayInputs} ${sfxInputs} -filter_complex "${filterComplex}" -map "[outv]" ${audioMapArgs} -c:v libx264 -c:a aac -shortest "${outputPath}"`;
    } else {
      cmd = `ffmpeg -y ${videoInputs} ${bgInput} ${overlayInputs} ${sfxInputs} -filter_complex "${filterComplex}" -map "[outv]" -c:v libx264 "${outputPath}"`;
    }

    updateJob(jobId, { progress: 45, message: "Rendering" });
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