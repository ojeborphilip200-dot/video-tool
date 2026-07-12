import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CACHE_DIR = path.join(process.cwd(), ".clip-cache");

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 25;

// Downloads a media URL, normalizes it to the target format once, caches the
// normalized result, and returns its file path. Subsequent calls for the same
// URL return instantly from cache.
export async function getCachedMedia(url: string, kind: "video" | "image"): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const hash = crypto.createHash("sha1").update(url).digest("hex");
  // Note: "-norm" suffix distinguishes normalized entries from the older raw cache format
  const ext = kind === "image" ? ".jpg" : ".mp4";
  const cachedPath = path.join(CACHE_DIR, `${hash}-norm${ext}`);

  try {
    await fs.access(cachedPath);
    return cachedPath; // cache hit
  } catch {
    // cache miss - download + normalize
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) video-tool/1.0",
    Accept: "*/*",
  };
  let res = await fetch(url, { headers });
  // Some IIIF servers (e.g. Art Institute) refuse certain size variants - retry smaller
  if (!res.ok && url.includes("/iiif/") && url.includes("/full/843,")) {
    res = await fetch(url.replace("/full/843,", "/full/600,"), { headers });
  }
  if (!res.ok) {
    throw new Error(`Failed to download media: ${res.status} ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const rawPath = path.join(CACHE_DIR, `${hash}-raw${ext}`);
  await fs.writeFile(rawPath, buffer);

  const tmpPath = `${cachedPath}.tmp${ext}`;

  if (kind === "video") {
    // Normalize once: exact resolution (scale+pad), square pixels, uniform fps, h264
    await execAsync(
      `ffmpeg -y -i "${rawPath}" -vf "scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS}" -an -c:v libx264 -preset fast "${tmpPath}"`,
      { maxBuffer: 1024 * 1024 * 50 }
    );
    await fs.rename(tmpPath, cachedPath);
    await fs.unlink(rawPath).catch(() => {});
  } else {
    // Images stay as-is (render loop handles scaling stills cheaply)
    await fs.rename(rawPath, cachedPath);
  }

  return cachedPath;
}