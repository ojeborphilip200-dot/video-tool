export type MediaItem = {
  id: string;
  kind: "video" | "image";
  thumbnail: string;
  previewUrl: string;
  duration: number;
  source: string;
  description: string;
};

// Openverse: aggregates CC images from Flickr, museums, Wikimedia and more. No key (rate-limited).
export async function searchOpenverse(query: string): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=3`,
      { headers: { "User-Agent": "video-tool/1.0" } }
    );
    const data = await res.json();
    if (!res.ok || !data.results) return [];
    return data.results
      .map((r: any) => ({
        id: `openverse-i-${r.id}`,
        kind: "image" as const,
        thumbnail: r.thumbnail || r.url,
        previewUrl: r.url,
        duration: 0,
        source: `openverse/${r.source || "cc"}`,
        description: `${r.title || ""} (license: ${r.license || "?"})`,
      }))
      .filter((m: MediaItem) => m.previewUrl);
  } catch {
    return [];
  }
}

// Wikimedia Commons: no key, huge archival/historical library.
export async function searchWikimedia(query: string): Promise<MediaItem[]> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent("filetype:bitmap " + query)}` +
      `&gsrlimit=3&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return [];
    return Object.values(pages)
      .map((p: any) => {
        const info = p.imageinfo?.[0];
        return {
          id: `wikimedia-i-${p.pageid}`,
          kind: "image" as const,
          thumbnail: info?.thumburl || info?.url || "",
          previewUrl: info?.url || "",
          duration: 0,
          source: "wikimedia",
          description: (p.title || "").replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
        };
      })
      .filter((m: MediaItem) => m.previewUrl);
  } catch {
    return [];
  }
}

// NASA Image Library: no key. Space, earth science, aeronautics.
export async function searchNasa(query: string): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=3`
    );
    const data = await res.json();
    const items = (data?.collection?.items || []).slice(0, 3);

    const results = await Promise.all(
      items.map(async (item: any) => {
        const meta = item.data?.[0];
        const thumb = item.links?.[0]?.href || "";
        if (!meta?.nasa_id || !thumb) return null;

        let preview = thumb;
        try {
          const assetRes = await fetch(`https://images-api.nasa.gov/asset/${meta.nasa_id}`);
          const asset = await assetRes.json();
          const hrefs: string[] = (asset?.collection?.items || []).map((i: any) => i.href);
          preview =
            hrefs.find((h) => h.includes("~medium.jpg")) ||
            hrefs.find((h) => h.includes("~large.jpg")) ||
            hrefs.find((h) => /\.jpg$/i.test(h)) ||
            thumb;
        } catch {
          // keep thumb as preview
        }

        return {
          id: `nasa-i-${meta.nasa_id}`,
          kind: "image" as const,
          thumbnail: thumb,
          previewUrl: preview,
          duration: 0,
          source: "nasa",
          description: meta.title || "",
        };
      })
    );

    return results.filter(Boolean) as MediaItem[];
  } catch {
    return [];
  }
}

// Art Institute of Chicago: no key, public-domain artworks.
export async function searchArtInstitute(query: string): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&fields=id,title,image_id&limit=3`
    );
    const data = await res.json();
    if (!res.ok || !data.data) return [];
    return data.data
      .filter((a: any) => a.image_id)
      .map((a: any) => ({
        id: `artic-i-${a.id}`,
        kind: "image" as const,
        thumbnail: `https://www.artic.edu/iiif/2/${a.image_id}/full/400,/0/default.jpg`,
        previewUrl: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
        duration: 0,
        source: "artic",
        description: a.title || "",
      }));
  } catch {
    return [];
  }
}
