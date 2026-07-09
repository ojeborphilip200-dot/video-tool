import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3`,
      {
        headers: {
          Authorization: process.env.PEXELS_API_KEY as string,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Pexels API error" },
        { status: res.status }
      );
    }

    // Simplify the response to just what we need
    const videos = data.videos.map((v: any) => ({
      id: v.id,
      thumbnail: v.image,
      previewUrl: v.video_files.find((f: any) => f.quality === "sd")?.link || v.video_files[0]?.link,
      duration: v.duration,
    }));

    return NextResponse.json({ videos });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}