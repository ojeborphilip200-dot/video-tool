import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { buildTextOverlay } from "../_lib/hfOverlays";

const execAsync = promisify(exec);

// Alpha proof: renders a themed callout overlay and composites it over a plain
// blue background. If the text floats over blue with no black box, alpha works.
export async function GET() {
  try {
    const start = Date.now();
    const overlay = await buildTextOverlay("callout", {
      text: "1969 · Apollo 11",
      theme: "crime",
      dur: 4,
    });
    console.log(`DEBUG - overlay built in ${((Date.now() - start) / 1000).toFixed(1)}s`);

    const out = path.join(os.tmpdir(), `hf-alpha-test-${Date.now()}.mp4`);
    await execAsync(
      `ffmpeg -y -f lavfi -i "color=c=0x224488:s=1280x720:r=25:d=5" ` +
        `-c:v libvpx-vp9 -i "${overlay}" ` +
        `-filter_complex "[0:v][1:v]overlay=0:0:eof_action=pass[out]" ` +
        `-map "[out]" -c:v libx264 -pix_fmt yuv420p -t 5 "${out}"`,
      { maxBuffer: 1024 * 1024 * 50 }
    );

    const buf = await fs.readFile(out);
    await fs.rm(out, { force: true });
    return new NextResponse(buf, { headers: { "Content-Type": "video/mp4" } });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
