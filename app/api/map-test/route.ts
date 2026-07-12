import { NextResponse } from "next/server";
import fs from "fs/promises";
import { buildMapClip } from "../_lib/mapFrames";

// Stage 1 proof: visit /api/map-test in the browser to see a rendered route.
export async function GET() {
  try {
    const start = Date.now();
    const { path: p } = await buildMapClip({
      template: "route",
      locations: [
        { name: "Paris", lat: 48.8566, lon: 2.3522 },
        { name: "Berlin", lat: 52.52, lon: 13.405 },
        { name: "Moscow", lat: 55.7558, lon: 37.6173 },
      ],
      durationSec: 6,
    });
    console.log(`DEBUG - map clip built in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    const buf = await fs.readFile(p);
    return new NextResponse(buf, { headers: { "Content-Type": "video/mp4" } });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
