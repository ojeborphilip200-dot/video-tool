import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import { createMapRenderer, MapConfig } from "./mapEngine";

const execAsync = promisify(exec);
const CACHE_DIR = path.join(process.cwd(), ".clip-cache");
const FPS = 25;

// Renders a MapConfig to a cached, normalized mp4 - enters the timeline like
// any other clip. Frames come from the SAME engine the browser preview uses.
export async function buildMapClip(config: MapConfig): Promise<{ path: string; duration: number }> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const key = crypto.createHash("sha1").update(JSON.stringify(config)).digest("hex");
  const outPath = path.join(CACHE_DIR, `map-${key}-norm.mp4`);

  try {
    await fs.access(outPath);
    return { path: outPath, duration: config.durationSec };
  } catch {
    // build it
  }

  const worldRaw = await fs.readFile(
    path.join(process.cwd(), "public", "map-data", "world.geo.json"),
    "utf-8"
  );
  const world = JSON.parse(worldRaw);
  const frame = createMapRenderer(world, config, 1280, 720);

  const tmpDir = path.join(CACHE_DIR, `map-${key}-frames`);
  await fs.mkdir(tmpDir, { recursive: true });

  const total = Math.max(1, Math.round(config.durationSec * FPS));
  for (let i = 0; i < total; i++) {
    const svg = frame(i / FPS);
    await sharp(Buffer.from(svg)).png().toFile(path.join(tmpDir, `f-${String(i).padStart(4, "0")}.png`));
  }

  const tmpOut = `${outPath}.tmp.mp4`;
  await execAsync(
    `ffmpeg -y -framerate ${FPS} -i "${tmpDir}/f-%04d.png" -c:v libx264 -pix_fmt yuv420p -preset fast "${tmpOut}"`,
    { maxBuffer: 1024 * 1024 * 50 }
  );
  await fs.rename(tmpOut, outPath);
  await fs.rm(tmpDir, { recursive: true, force: true });

  return { path: outPath, duration: config.durationSec };
}
