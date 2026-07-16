import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CACHE_DIR = path.join(process.cwd(), ".clip-cache");
const FPS = 25;
const FADE = 0.5;

function kenBurns(durationSec: number): string {
  const frames = Math.max(1, Math.round(durationSec * FPS));
  const pre = `scale=w='if(lt(a,1),-2,if(lt(a,16/9),1920,-2))':h='if(lt(a,1),982,if(lt(a,16/9),-2,1080))',crop=w='min(1920,iw)':h='min(1080,ih)',pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p`;
  const variants = [
    `zoompan=z='min(zoom+0.0005,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
    `zoompan=z='if(eq(on,0),1.10,max(zoom-0.0005,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
    `zoompan=z='1.10':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${FPS}`,
  ];
  const pick = variants[Math.floor(Math.random() * variants.length)];
  return `${pre},${pick},setsar=1,format=yuv420p,settb=AVTB`;
}

// Pre-renders N images into ONE seamless slideshow clip: Ken Burns motion per
// image, crossfades between them. Homogeneous zoompan streams crossfade
// reliably (unlike the mixed video/image inputs that broke xfade in the main
// pass). Cached by content hash - repeat renders are instant.
const inFlight = new Map<string, Promise<{ path: string; duration: number }>>();

export async function buildImageSequenceClip(
  files: string[],
  durations: number[]
): Promise<{ path: string; duration: number }> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const total = durations.reduce((s, d) => s + d, 0);
  const key = crypto
    .createHash("sha1")
    .update(files.join("|") + "::" + durations.map((d) => d.toFixed(2)).join(","))
    .digest("hex");
  const outPath = path.join(CACHE_DIR, `seq-${key}.mp4`);

  try {
    await fs.access(outPath);
    return { path: outPath, duration: total };
  } catch {
    // build it
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const buildPromise = (async (): Promise<{ path: string; duration: number }> => {
  const n = files.length;
  const inputs = files.map((f) => `-i "${f}"`).join(" ");

  // Each image (except the last) is rendered FADE longer, so the crossfade
  // overlap consumes padding - total duration stays exactly sum(durations)
  let filters = "";
  for (let i = 0; i < n; i++) {
    const dur = durations[i] + (i < n - 1 ? FADE : 0);
    filters += `[${i}:v:0]${kenBurns(dur)}[k${i}]; `;
  }

  let chain = "";
  let prev = "k0";
  let offset = 0;
  for (let i = 1; i < n; i++) {
    offset += durations[i - 1];
    const out = i === n - 1 ? "outv" : `x${i}`;
    chain += `[${prev}][k${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[${out}]; `;
    prev = out;
  }

  const filterComplex = (filters + chain).trim().replace(/;$/, "");
  const tmp = `${outPath}.tmp.mp4`;
  try {
    await execAsync(
    `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -c:v libx264 -preset fast "${tmp}"`,
    { maxBuffer: 1024 * 1024 * 50 }
  );
  } catch (ffErr: any) {
    const msg = String(ffErr?.stderr || ffErr?.message || '');
    await fs.writeFile(path.join(process.cwd(), 'ffmpeg-error.txt'), '[app/api/_lib/slideshow.ts]\n' + msg).catch(() => {});
    throw ffErr;
  }
  await fs.rename(tmp, outPath);
  return { path: outPath, duration: total };
  })();

  inFlight.set(key, buildPromise);
  try {
    return await buildPromise;
  } finally {
    inFlight.delete(key);
  }
}
