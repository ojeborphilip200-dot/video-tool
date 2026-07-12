import { NextRequest, NextResponse } from "next/server";
import { detectYearCallouts, detectLocationCallouts } from "../_lib/captions";
import { detectCountups } from "../_lib/countups";

// Runs callout + count-up detection ahead of render so the editor can show,
// curate, and delete text animations on the timeline.
export async function POST(req: NextRequest) {
  try {
    const { script, words, countupLevel, calloutsEnabled } = await req.json();
    if (!Array.isArray(words) || words.length === 0) {
      return NextResponse.json({ callouts: [], countups: [] });
    }

    let callouts: { text: string; start: number; end: number }[] = [];
    if (calloutsEnabled !== false) {
      callouts = detectYearCallouts(words);
      if (script) {
        try {
          const locs = await detectLocationCallouts(script, words);
          callouts = [...callouts, ...locs];
        } catch (e) {
          console.error("Location detection failed in preflight:", e);
        }
      }
    }

    let countups: any[] = [];
    if (countupLevel && countupLevel !== "off" && script) {
      try {
        countups = await detectCountups(script, words, countupLevel);
      } catch (e) {
        console.error("Countup detection failed in preflight:", e);
      }
    }

    return NextResponse.json({
      callouts: callouts.map((c, i) => ({ id: `co-${i}`, ...c })),
      countups: countups.map((c, i) => ({ id: `cu-${i}`, ...c })),
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
