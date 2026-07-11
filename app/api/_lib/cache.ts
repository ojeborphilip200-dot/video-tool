import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = path.join(process.cwd(), ".clip-cache");

// Downloads a media URL to the local cache (if not already there) and returns its file path.
// Files are keyed by a hash of the URL, so the same clip is never downloaded twice.
export async function getCachedMedia(url: string, kind: "video" | "image"): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const hash = crypto.createHash("sha1").update(url).digest("hex");
  const ext = kind === "image" ? ".jpg" : ".mp4";
  const cachedPath = path.join(CACHE_DIR, `${hash}${ext}`);

  try {
    await fs.access(cachedPath);
    return cachedPath; // cache hit - no download needed
  } catch {
    // cache miss - download it
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download media: ${res.status} ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  // Write to a temp name first, then rename - prevents a half-downloaded
  // file being treated as a valid cache entry if the process dies mid-write
  const tmpPath = `${cachedPath}.tmp`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, cachedPath);

  return cachedPath;
}