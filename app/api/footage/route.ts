import { NextRequest, NextResponse } from "next/server";
import { searchOpenverse, searchWikimedia, searchNasa, searchArtInstitute, searchMet, searchLoc, searchINaturalist, searchUnsplash, searchEuropeana, searchSmithsonian } from "../_lib/providers";

type MediaItem = {
  id: string;
  kind: "video" | "image";
  thumbnail: string;
  previewUrl: string;
  duration: number;
  source: string;
  description: string;
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
      source: "pixabay" as const,
      description: p.tags || "",
    }));
  } catch {
    return [];
  }
}

// Ask Claude to rank all candidates against the beat's narration.
// Returns the same items, sorted best-first. Any failure = original order.
async function rankMedia(
  beatText: string,
  keywords: string[],
  items: MediaItem[]
): Promise<MediaItem[]> {
  if (items.length <= 1) return items;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const candidateList = items
      .map((m) => `- id: ${m.id} | kind: ${m.kind} | description: ${m.description || "(none)"}`)
      .join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `I'm matching stock media to a narration segment in a video.

Narration: "${beatText}"
Search keywords used: ${keywords.join(", ")}

Candidates:
${candidateList}

Rank ALL candidates from best visual match to worst, judging by how well each description fits what the narration is about. Respond ONLY with a JSON array of ids in ranked order, no other text.`,
        },
      ],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const rankedIds: string[] = JSON.parse(cleaned);

    const rankIndex = new Map(rankedIds.map((id, i) => [id, i]));
    return [...items].sort(
      (a, b) => (rankIndex.get(a.id) ?? 999) - (rankIndex.get(b.id) ?? 999)
    );
  } catch (err) {
    console.error("Ranking failed, using original order:", err);
    return items;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query, beatText, keywords, page: rawPage } = await req.json();
    const page = Math.max(1, parseInt(rawPage) || 1);

    if (!query) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    const [
      pexelsVideos,
      pixabayVideos,
      pexelsImages,
      pixabayImages,
      openverseImages,
      wikimediaImages,
      nasaImages,
      articImages,
      metImages,
      locImages,
      inatImages,
      unsplashImages,
      europeanaImages,
      smithsonianImages,
    ] = await Promise.all([
      searchPexelsVideos(query, page),
      searchPixabayVideos(query, page),
      searchPexelsImages(query, page),
      searchPixabayImages(query, page),
      searchOpenverse(query, page),
      searchWikimedia(query, page),
      searchNasa(query, page),
      searchArtInstitute(query, page),
      searchMet(query, page),
      searchLoc(query, page),
      searchINaturalist(query, page),
      searchUnsplash(query, page),
      searchEuropeana(query, page),
      searchSmithsonian(query, page),
    ]);

    let videos = [...pexelsVideos, ...pixabayVideos];
    let images = [...pexelsImages, ...pixabayImages, ...openverseImages, ...wikimediaImages, ...nasaImages, ...articImages, ...metImages, ...locImages, ...inatImages, ...unsplashImages, ...europeanaImages, ...smithsonianImages];

    // AI ranking: one call ranks videos and images together, then we split back out
    if (beatText) {
      const ranked = await rankMedia(beatText, keywords || [], [...videos, ...images]);
      videos = ranked.filter((m) => m.kind === "video");
      images = ranked.filter((m) => m.kind === "image");
    }

    videos = videos.slice(0, 4);
    images = images.slice(0, 4);

    return NextResponse.json({ videos, images });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}