import { NextRequest, NextResponse } from "next/server";

type Video = {
  id: string;
  thumbnail: string;
  previewUrl: string;
  duration: number;
  source: "pexels" | "pixabay";
};

async function searchPexels(query: string): Promise<Video[]> {
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3`,
      { headers: { Authorization: process.env.PEXELS_API_KEY as string } }
    );
    const data = await res.json();
    if (!res.ok || !data.videos) return [];

    return data.videos.map((v: any) => ({
      id: `pexels-${v.id}`,
      thumbnail: v.image,
      previewUrl:
        v.video_files.find((f: any) => f.quality === "sd")?.link || v.video_files[0]?.link,
      duration: v.duration,
      source: "pexels" as const,
    }));
  } catch {
    return [];
  }
}

async function searchPixabay(query: string): Promise<Video[]> {
  try {
    const res = await fetch(
      `https://pixabay.com/api/videos/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=3`
    );
    const data = await res.json();
    if (!res.ok || !data.hits) return [];

    return data.hits.map((v: any) => ({
      id: `pixabay-${v.id}`,
      thumbnail: v.videos.tiny.thumbnail,
      previewUrl: v.videos.small.url || v.videos.medium.url,
      duration: v.duration,
      source: "pixabay" as const,
    }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    const [pexelsResults, pixabayResults] = await Promise.all([
      searchPexels(query),
      searchPixabay(query),
    ]);

    const videos = [...pexelsResults, ...pixabayResults];

    return NextResponse.json({ videos });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}