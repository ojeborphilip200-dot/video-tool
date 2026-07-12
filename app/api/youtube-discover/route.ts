import { NextRequest, NextResponse } from "next/server";

type YtCandidate = {
  videoId: string;
  title: string;
  channel: string;
  license: "creativeCommon" | "youtube";
  duration: number;
  thumbnail: string;
  url: string;
  description: string;
};

function isoDurationToSeconds(iso: string): number {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return parseInt(m[1] || "0") * 3600 + parseInt(m[2] || "0") * 60 + parseInt(m[3] || "0");
}

async function ytSearch(query: string, cc: boolean, key: string): Promise<string[]> {
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5` +
      `&q=${encodeURIComponent(query)}` +
      (cc ? `&videoLicense=creativeCommon` : "") +
      `&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.items) return [];
    return data.items.map((i: any) => i?.id?.videoId).filter(Boolean);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "No YOUTUBE_API_KEY configured" }, { status: 500 });
    }

    const { beatText, entities, queries } = await req.json();
    const queryList: string[] = (Array.isArray(queries) ? queries : []).filter(Boolean).slice(0, 3);
    if (queryList.length === 0) {
      return NextResponse.json({ error: "No queries provided" }, { status: 400 });
    }

    // Creative-Commons pass on the primary query first, then standard passes on all tiers
    const idBatches = await Promise.all([
      ytSearch(queryList[0], true, key),
      ...queryList.map((q) => ytSearch(q, false, key)),
    ]);
    const ids = [...new Set(idBatches.flat())].slice(0, 15);
    if (ids.length === 0) return NextResponse.json({ candidates: [] });

    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${ids.join(",")}&key=${key}`
    );
    const detailData = await detailRes.json();
    const items = detailData?.items || [];

    let candidates: YtCandidate[] = items
      .map((v: any) => ({
        videoId: v.id,
        title: v?.snippet?.title || "",
        channel: v?.snippet?.channelTitle || "",
        license: v?.status?.license === "creativeCommon" ? ("creativeCommon" as const) : ("youtube" as const),
        duration: isoDurationToSeconds(v?.contentDetails?.duration || ""),
        thumbnail: v?.snippet?.thumbnails?.medium?.url || v?.snippet?.thumbnails?.default?.url || "",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        description: (v?.snippet?.description || "").slice(0, 300),
      }))
      .filter((c: YtCandidate) => c.duration > 3);

    // Claude ranking: relevance, source reliability, license suitability
    if (candidates.length > 1 && beatText) {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const list = candidates
          .map(
            (c) =>
              `- id: ${c.videoId} | channel: ${c.channel} | license: ${c.license} | duration: ${c.duration}s | title: ${c.title} | desc: ${c.description.slice(0, 120)}`
          )
          .join("\n");
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 800,
          messages: [
            {
              role: "user",
              content: `You are a documentary researcher evaluating YouTube videos as potential footage sources for a narration segment.

Narration: "${beatText}"
Subjects: ${(entities || []).join(", ") || "(none)"}

Candidates:
${list}

Score each 0-100: exact relevance to the narration's subject (0-40), source reliability - official/government/archival/news channels high, random re-uploads low (0-25), license suitability - creativeCommon higher than standard (0-20), likely visual quality (0-10), diversity vs other candidates (0-5).

Respond ONLY with a JSON array: [{"id":"...","score":82}, ...]`,
            },
          ],
        });
        const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
        const scored: { id: string; score: number }[] = JSON.parse(
          rawText.replace(/```json|```/g, "").trim()
        );
        const scoreMap = new Map(scored.map((s) => [s.id, s.score]));
        candidates = candidates.sort(
          (a, b) => (scoreMap.get(b.videoId) ?? 0) - (scoreMap.get(a.videoId) ?? 0)
        );
      } catch (e) {
        console.error("YouTube ranking failed, keeping API order:", e);
      }
    }

    return NextResponse.json({ candidates: candidates.slice(0, 6) });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
