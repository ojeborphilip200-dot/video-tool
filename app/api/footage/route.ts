import { NextRequest, NextResponse } from "next/server";
import { visionRank } from "../_lib/visionRank";
import { searchOpenverse, searchWikimedia, searchNasa, searchArtInstitute, searchMet, searchLoc, searchINaturalist, searchUnsplash, searchEuropeana, searchSmithsonian, searchNasaVideos, searchInternetArchiveVideos } from "../_lib/providers";

type MediaItem = {
  id: string;
  kind: "video" | "image";
  thumbnail: string;
  previewUrl: string;
  duration: number;
  source: string;
  description: string;
  width?: number;
  height?: number;
};

function slugToWords(url: string): string {
  // Pexels URLs look like https://www.pexels.com/video/drone-view-of-a-beach-857321/
  const match = url.match(/\/(video|photo)\/([^/]+)-\d+\/?$/);
  return match ? match[2].replace(/-/g, " ") : "";
}

async function searchPexelsVideos(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3&page=${page}`,
      { headers: { Authorization: process.env.PEXELS_API_KEY as string } }
    );
    const data = await res.json();
    if (!res.ok || !data.videos) return [];

    return data.videos.map((v: any) => ({
      id: `pexels-v-${v.id}`,
      kind: "video" as const,
      thumbnail: v.image,
      previewUrl:
        v.video_files.find((f: any) => f.quality === "sd")?.link || v.video_files[0]?.link,
      duration: v.duration,
      width: v.width,
      height: v.height,
      source: "pexels" as const,
      description: slugToWords(v.url),
    }));
  } catch {
    return [];
  }
}

async function searchPexelsImages(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&page=${page}`,
      { headers: { Authorization: process.env.PEXELS_API_KEY as string } }
    );
    const data = await res.json();
    if (!res.ok || !data.photos) return [];

    return data.photos.map((p: any) => ({
      id: `pexels-i-${p.id}`,
      kind: "image" as const,
      thumbnail: p.src.medium,
      previewUrl: p.src.large2x || p.src.large,
      duration: 0,
      width: p.width,
      height: p.height,
      source: "pexels" as const,
      description: p.alt || slugToWords(p.url),
    }));
  } catch {
    return [];
  }
}

async function searchPixabayVideos(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://pixabay.com/api/videos/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=3&page=${page}`
    );
    const data = await res.json();
    if (!res.ok || !data.hits) return [];

    return data.hits.map((v: any) => ({
      id: `pixabay-v-${v.id}`,
      kind: "video" as const,
      thumbnail: v.videos.tiny.thumbnail,
      previewUrl: v.videos.small.url || v.videos.medium.url,
      duration: v.duration,
      width: v.videos?.small?.width,
      height: v.videos?.small?.height,
      source: "pixabay" as const,
      description: v.tags || "",
    }));
  } catch {
    return [];
  }
}

async function searchPixabayImages(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=3&image_type=photo&page=${page}`
    );
    const data = await res.json();
    if (!res.ok || !data.hits) return [];

    return data.hits.map((p: any) => ({
      id: `pixabay-i-${p.id}`,
      kind: "image" as const,
      thumbnail: p.previewURL,
      previewUrl: p.largeImageURL,
      duration: 0,
      width: p.imageWidth,
      height: p.imageHeight,
      source: "pixabay" as const,
      description: p.tags || "",
    }));
  } catch {
    return [];
  }
}

// Rubric-based ranking: scores every candidate 0-100 like a documentary researcher.
async function rankMedia(
  beatText: string,
  entities: string[],
  queries: string[],
  items: MediaItem[],
  priorityProviders: string[] = [],
  beatEra: string = ""
): Promise<MediaItem[]> {
  if (items.length <= 1) return items;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const candidateList = items
      .map((m) => `- id: ${m.id} | kind: ${m.kind} | source: ${m.source} | description: ${m.description || "(none)"}`)
      .join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      messages: [
        {
          role: "user",
          content: `You are an experienced documentary visual researcher choosing footage for a narration segment.

Narration: "${beatText}"
Subjects/entities discussed: ${entities.join(", ") || "(none identified)"}
Searches used: ${queries.join(" | ")}

Candidates (metadata only):
${candidateList}

Score EVERY candidate 0-100 using this rubric:
- Exact subject match - likely shows the ACTUAL person/company/place/event/era discussed (0-40)
- Semantic relevance to the narration's meaning (0-25)
- Time-period accuracy when the narration is historical (0-15)
- Source fit: archival/government sources (nasa, internet-archive, loc, wikimedia, europeana, smithsonian) are STRONGLY preferred whenever the narration names a specific subject, event, or era - even if older, grainy, or 4:3. Modern stock (pexels, pixabay, unsplash) only wins for present-day generic scenes (0-10)
- Novelty vs the other candidates (0-5)
- Low watermark/text-clutter risk (0-5)

HARD RULES:
- Never let a prettier generic clip outrank real footage of the actual subject. Resolution and modern look do NOT compensate for showing the wrong thing.
- Abstract "concept" stock (handshakes, skylines, keyboards, sunsets) scores below 35 whenever the narration names a concrete subject - it only scores 40-60 when the narration itself is genuinely abstract.
- A candidate likely depicting the WRONG entity or wrong period scores below 30.
- Likely exact matches of the named subject score 75+.

Respond ONLY with a JSON array, no other text: [{"id":"...","score":87}, ...]`,
        },
      ],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const scored: { id: string; score: number }[] = JSON.parse(cleaned);
    const scoreMap = new Map(scored.map((s) => [s.id, s.score]));

    let ranked = [...items].sort(
      (a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0)
    );

    // Reject weak candidates (score < 35) as long as enough strong ones remain
    // Prioritized archives get a ranking bonus: best-ranked first, then the rest.
    // A wrong-subject archival image still can't outrank a right-subject one -
    // the bonus only breaks ties between comparable candidates.
    if (priorityProviders.length > 0) {
      for (const m of ranked) {
        const rank = priorityProviders.indexOf(m.source);
        if (rank >= 0) {
          const bonus = 12 - rank * 3; // 1st choice +12, 2nd +9, 3rd +6, 4th +3
          scoreMap.set(m.id, (scoreMap.get(m.id) ?? 0) + Math.max(3, bonus));
        }
      }
      ranked.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
      console.log(
        `DEBUG - provider routing${beatEra ? ` (${beatEra})` : ""}: prioritized ${priorityProviders.join(" > ")}`
      );
    }

    const strong = ranked.filter((m) => (scoreMap.get(m.id) ?? 0) >= 40);
    if (strong.length >= 6) ranked = strong;

    return ranked;
  } catch (err) {
    console.error("Ranking failed, using original order:", err);
    return items;
  }
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    let mediaType = "image/jpeg";
    if (ct.includes("png")) mediaType = "image/png";
    else if (ct.includes("webp")) mediaType = "image/webp";
    else if (ct.includes("gif")) mediaType = "image/gif";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3 * 1024 * 1024) return null;
    return { data: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}

// Stage 3: vision verification. Claude inspects the top candidates' thumbnails at
// SCENE level only (never person identification): does the content fit the
// narration, is it free of watermarks/text clutter, does it compose for 16:9.
// Failures are demoted to the back of their list, not deleted.
async function verifyTopCandidates(
  beatText: string,
  entities: string[],
  videos: MediaItem[],
  images: MediaItem[]
): Promise<{ videos: MediaItem[]; images: MediaItem[] }> {
  const targets = [...images.slice(0, 3), ...videos.slice(0, 2)];
  if (targets.length === 0) return { videos, images };

  try {
    const fetched = await Promise.all(
      targets.map(async (m) => ({
        item: m,
        img: await fetchImageAsBase64(m.thumbnail || m.previewUrl),
      }))
    );
    const inspectable = fetched.filter((f) => f.img);
    if (inspectable.length === 0) return { videos, images };

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const content: any[] = [];
    for (const f of inspectable) {
      content.push({ type: "text", text: `Candidate id: ${f.item.id}` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: f.img!.mediaType, data: f.img!.data },
      });
    }
    content.push({
      type: "text",
      text: `These are candidate visuals for a documentary narration segment.

Narration: "${beatText}"
Subjects discussed: ${entities.join(", ") || "(none)"}

For EACH candidate id above, verify at scene level ONLY - do NOT attempt to identify any person:
- Does the scene content plausibly fit the narration's subject and era?
- Is it free of prominent watermarks or heavy baked-in text?
- Is the composition workable for a 16:9 video frame?

Respond ONLY with a JSON array, no other text: [{"id":"...","pass":true,"reason":"..."}]`,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const verdicts: { id: string; pass: boolean; reason?: string }[] = JSON.parse(cleaned);
    const failed = new Set(verdicts.filter((v) => v.pass === false).map((v) => v.id));

    if (failed.size > 0) {
      console.log(
        `DEBUG - vision verification demoted: ${verdicts
          .filter((v) => !v.pass)
          .map((v) => `${v.id} (${v.reason || "failed"})`)
          .join("; ")}`
      );
      const demote = (arr: MediaItem[]) => [
        ...arr.filter((m) => !failed.has(m.id)),
        ...arr.filter((m) => failed.has(m.id)),
      ];
      return { videos: demote(videos), images: demote(images) };
    }

    console.log(`DEBUG - vision verification: all ${inspectable.length} inspected candidates passed`);
    return { videos, images };
  } catch (err) {
    console.error("Vision verification failed, keeping ranked order:", err);
    return { videos, images };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { beatText, keywords, entities, page: rawPage } = body;
    const page = Math.max(1, parseInt(rawPage) || 1);
    const excludeIds: string[] = Array.isArray(body.excludeIds) ? body.excludeIds : [];
    if (body.historyMode === true) console.log("DEBUG - HISTORY MODE: archives and museums only, stock skipped");
    // Provider-aware routing: the planner ranks which archives should hold real
    // imagery for this beat (LOC for American history, Europeana for European,
    // Met/Smithsonian/Wikimedia for antiquity, NASA for space...)
    // History mode: source ONLY from history archives and art museums -
    // modern stock libraries are skipped entirely
    const historyMode = body.historyMode === true;
    let priorityProviders: string[] = Array.isArray(body.providers) ? body.providers : [];
    if (historyMode && priorityProviders.length === 0) {
      priorityProviders = ["loc", "wikimedia", "met", "artic", "europeana", "smithsonian"];
    }
    const beatEra: string = typeof body.era === "string" ? body.era : "";
    const mediaType: string =
      body.mediaType === "video" || body.mediaType === "image" ? body.mediaType : "both";
    const wantV = mediaType !== "image";
    const wantI = mediaType !== "video";
    const stockV = wantV && body.historyMode !== true;
    const stockI = wantI && body.historyMode !== true;
    const none: Promise<MediaItem[]> = Promise.resolve([]);

    const queryList: string[] = (
      Array.isArray(body.queries) && body.queries.length > 0 ? body.queries : [body.query]
    )
      .filter(Boolean)
      .slice(0, 6);

    if (queryList.length === 0) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    let videos: MediaItem[] = [];
    let images: MediaItem[] = [];

    // Round 1: the exact (Tier 1) query across all 14 providers
    const q0 = queryList[0];
    const r1 = await Promise.all([
      stockV ? searchPexelsVideos(q0, page) : none,
      stockV ? searchPixabayVideos(q0, page) : none,
      stockI ? searchPexelsImages(q0, page) : none,
      stockI ? searchPixabayImages(q0, page) : none,
      wantI ? searchOpenverse(q0, page) : none,
      wantI ? searchWikimedia(q0, page) : none,
      wantI ? searchNasa(q0, page) : none,
      wantI ? searchArtInstitute(q0, page) : none,
      wantI ? searchMet(q0, page) : none,
      wantI ? searchLoc(q0, page) : none,
      stockI ? searchINaturalist(q0, page) : none,
      stockI ? searchUnsplash(q0, page) : none,
      wantI ? searchEuropeana(q0, page) : none,
      wantI ? searchSmithsonian(q0, page) : none,
      wantV ? searchNasaVideos(q0, page) : none,
      wantV ? searchInternetArchiveVideos(q0, page) : none,
    ]);
    videos.push(...r1[0], ...r1[1], ...r1[14], ...r1[15]);
    for (const arr of r1.slice(2, 14)) images.push(...arr);

    // Rounds 2+: EVERY remaining query across the FULL provider set. Retrieval
    // breadth is what picture research lives on - you cannot rank your way to a
    // good image that was never fetched.
    for (let qi = 1; qi < queryList.length; qi++) {
      if (videos.length + images.length >= 70) break;
      const q = queryList[qi];
      const rN = await Promise.all([
        stockV ? searchPexelsVideos(q, page) : none,
        stockV ? searchPixabayVideos(q, page) : none,
        stockI ? searchPexelsImages(q, page) : none,
        stockI ? searchPixabayImages(q, page) : none,
        wantI ? searchOpenverse(q, page) : none,
        wantI ? searchWikimedia(q, page) : none,
        wantI ? searchNasa(q, page) : none,
        wantI ? searchArtInstitute(q, page) : none,
        wantI ? searchMet(q, page) : none,
        wantI ? searchLoc(q, page) : none,
        stockI ? searchINaturalist(q, page) : none,
        stockI ? searchUnsplash(q, page) : none,
        wantI ? searchEuropeana(q, page) : none,
        wantI ? searchSmithsonian(q, page) : none,
        wantV ? searchNasaVideos(q, page) : none,
        wantV ? searchInternetArchiveVideos(q, page) : none,
      ]);
      videos.push(...rN[0], ...rN[1], ...rN[14], ...rN[15]);
      for (const arr of rN.slice(2, 14)) images.push(...arr);
    }

    // Hard filters first: cross-beat exclusions, dedupe, resolution minimums
    const seen = new Set<string>(excludeIds);
    const fetchedV = videos.length;
    const fetchedI = images.length;

    const bigEnough = (m: MediaItem) => {
      if (!m.width || !m.height) return true; // unknown dimensions pass
      return m.kind === "image" ? m.width >= 800 && m.height >= 450 : m.width >= 640;
    };

    const dedupe = (arr: MediaItem[]) =>
      arr.filter((m) => {
        if (!m.previewUrl || seen.has(m.id) || seen.has(m.previewUrl)) return false;
        if (!bigEnough(m)) return false;
        seen.add(m.id);
        seen.add(m.previewUrl);
        return true;
      });
    videos = dedupe(videos);
    images = dedupe(images);
    console.log(
      `DEBUG - hard filters: ${fetchedV}v/${fetchedI}i fetched -> ${videos.length}v/${images.length}i kept (${excludeIds.length} excluded ids)`
    );

    console.log(
      `DEBUG - sourcing: ${queryList.length} queries -> ${videos.length} videos, ${images.length} images before ranking`
    );

    // VISION-FIRST RANKING: captions are the worst signal in this pipeline
    // (stock libraries keyword-spam, archives write catalog-speak), so the
    // engine now JUDGES WHAT IT SEES. Metadata ranking is only a cheap pre-sort
    // to decide which candidates get looked at.
    if (beatText) {
      const preRanked = await rankMedia(
        beatText,
        entities || keywords || [],
        queryList,
        [...videos, ...images],
        priorityProviders,
        beatEra
      );

      const verdicts = await visionRank(
        beatText,
        entities || [],
        beatEra,
        preRanked.slice(0, 20).map((m) => ({
          id: m.id,
          kind: m.kind,
          thumbnail: m.thumbnail,
          source: m.source,
          description: m.description,
        })),
        historyMode
      );

      if (verdicts.size > 0) {
        const metaOrder = new Map(preRanked.map((m, i) => [m.id, i]));
        const scoreOf = (m: MediaItem) => {
          const v = verdicts.get(m.id);
          if (!v) return -1; // never looked at (beyond the batch): behind everything seen
          const bonus = priorityProviders.indexOf(m.source) >= 0 ? 4 : 0;
          return v.score + bonus;
        };

        const scored = preRanked
          .map((m) => ({ m, s: scoreOf(m) }))
          .sort((a, b) => b.s - a.s || (metaOrder.get(a.m.id)! - metaOrder.get(b.m.id)!));

        try {
          const fsp = await import("fs/promises");
          const nodePath = await import("path");
          const lines =
            `\n=== BEAT: ${beatText.slice(0, 70)}\n` +
            scored
              .slice(0, 8)
              .map(({ m, s }) => `  ${String(s).padStart(3)} [${m.source}] ${verdicts.get(m.id)?.reason || "(not inspected)"}`)
              .join("\n");
          await fsp.appendFile(nodePath.join(process.cwd(), "vision-debug.txt"), lines + "\n");
        } catch {}

        console.log(
          "DEBUG - vision ranking (top 6):\n" +
            scored
              .slice(0, 6)
              .map(({ m, s }) => `   ${s >= 0 ? s : "--"} [${m.source}] ${verdicts.get(m.id)?.reason || "(not inspected)"}`)
              .join("\n")
        );

        const rejected = scored.filter(({ s }) => s >= 0 && s < 35).length;
        if (rejected > 0) console.log(`DEBUG - vision rejected ${rejected} candidate(s) below 35`);

        // Drop what the eye rejected, as long as enough usable ones remain
        const usable = scored.filter(({ s }) => s >= 35).map(({ m }) => m);
        const ordered = usable.length >= 4 ? usable : scored.map(({ m }) => m);

        videos = ordered.filter((m) => m.kind === "video");
        images = ordered.filter((m) => m.kind === "image");

        const best = scored[0]?.s ?? -1;
        if (best < 60) {
          console.log(`DEBUG - WEAK BEAT: best vision score only ${best} - retrieval needs a better query`);
        }
      } else {
        // Vision unavailable: fall back to the metadata order
        videos = preRanked.filter((m) => m.kind === "video");
        images = preRanked.filter((m) => m.kind === "image");
      }
    }

    videos = videos.slice(0, 4);
    images = images.slice(0, 4);

    return NextResponse.json({ videos, images });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
