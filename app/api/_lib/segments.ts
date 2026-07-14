import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CACHE_DIR = path.join(process.cwd(), ".clip-cache");
const W = 1280;
const H = 720;
const FPS = 25;

// Ken Burns, but DETERMINISTIC: the motion variant comes from the file hash, so
// the same image always produces the same segment and the cache actually hits.
function kenBurns(seed: string, durationSec: number): string {
  const frames = Math.max(1, Math.round(durationSec * FPS));
  const pre =
    `scale=w='if(lt(a,1),-2,if(lt(a,16/9),1920,-2))':h='if(lt(a,1),982,if(lt(a,16/9),-2,1080))',` +
    `crop=w='min(1920,iw)':h='min(1080,ih)',pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white`;

  const variants = [
    `zoompan=z='min(zoom+0.0005,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}`,
    `zoompan=z='if(eq(on,0),1.10,max(zoom-0.0005,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}`,
    `zoompan=z='1.10':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}`,
  ];
  const pick = variants[parseInt(seed.slice(0, 8), 16) % variants.length];
  return `${pre},${pick},setsar=1,format=yuv420p,fps=${FPS}`;
}

// Pre-renders ONE clip into a finished, concat-ready segment: trim, motion,
// scaling and padding all baked in. The main render then only stitches segments
// together - so re-renders skip this entirely, and first renders build many
// segments at once instead of one giant filter graph.
export async function buildSegment(opts: {
  file: string;
  kind: "video" | "image";
  trimStart: number;
  trimEnd: number;
  padAfter?: number;
}): Promise<{ path: string; duration: number }> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const dur = Math.max(0.1, opts.trimEnd - opts.trimStart);
  const pad = opts.padAfter && opts.padAfter > 0.02 ? opts.padAfter : 0;

  const fileHash = crypto.createHash("sha1").update(opts.file).digest("hex");
  const key = crypto
    .createHash("sha1")
    .update(
      [opts.file, opts.kind, opts.trimStart.toFixed(3), opts.trimEnd.toFixed(3), pad.toFixed(3)].join("|")
    )
    .digest("hex");
  const outPath = path.join(CACHE_DIR, `seg-${key}.mp4`);

  try {
    await fs.access(outPath);
    return { path: outPath, duration: dur + pad };
  } catch {
    // build it
  }

  const padFilter = pad > 0 ? `,tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : "";
  let cmd: string;

  if (opts.kind === "image") {
    const vf = kenBurns(fileHash, dur + pad);
    cmd =
      `ffmpeg -y -loop 1 -t ${(dur + pad).toFixed(3)} -i "${opts.file}" ` +
      `-vf "${vf}" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "${outPath}.tmp.mp4"`;
  } else {
    const vf =
      `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}${padFilter},format=yuv420p`;
    cmd =
      `ffmpeg -y -ss ${opts.trimStart.toFixed(3)} -t ${dur.toFixed(3)} -i "${opts.file}" ` +
      `-vf "${vf}" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "${outPath}.tmp.mp4"`;
  }

  await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });
  await fs.rename(`${outPath}.tmp.mp4`, outPath);
  return { path: outPath, duration: dur + pad };
}
