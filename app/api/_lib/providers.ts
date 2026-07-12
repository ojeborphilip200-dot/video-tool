export type MediaItem = {
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

// Openverse: aggregates CC images from Flickr, museums, Wikimedia and more. No key (rate-limited).
export async function searchOpenverse(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=3&page=${page}`,
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
export async function searchWikimedia(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent("filetype:bitmap " + query)}` +
      `&gsrlimit=3&gsroffset=${(page - 1) * 3}&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`;
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
export async function searchNasa(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=3&page=${page}`
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
export async function searchArtInstitute(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&fields=id,title,image_id&limit=3&page=${page}`
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

// The Met: no key, public-domain artworks and artifacts. Two-step API (search -> object details).
export async function searchMet(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(query)}&hasImages=true`
    );
    const data = await res.json();
    const ids: number[] = (data?.objectIDs || []).slice((page - 1) * 3, (page - 1) * 3 + 3);
    if (ids.length === 0) return [];

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const objRes = await fetch(
            `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`
          );
          const obj = await objRes.json();
          if (!obj?.primaryImage) return null;
          return {
            id: `met-i-${id}`,
            kind: "image" as const,
            thumbnail: obj.primaryImageSmall || obj.primaryImage,
            previewUrl: obj.primaryImage,
            duration: 0,
            source: "met",
            description: obj.title || "",
          };
        } catch {
          return null;
        }
      })
    );

    return results.filter(Boolean) as MediaItem[];
  } catch {
    return [];
  }
}

// Library of Congress: no key. Historical photos, prints, documents.
export async function searchLoc(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://www.loc.gov/photos/?q=${encodeURIComponent(query)}&fo=json&c=3&sp=${page}`
    );
    const data = await res.json();
    const items = (data?.results || []).slice(0, 3);
    return items
      .map((r: any) => {
        const imgs: string[] = Array.isArray(r.image_url) ? r.image_url : [];
        if (imgs.length === 0) return null;
        const thumb = imgs[0];
        const preview = imgs[imgs.length - 1] || thumb;
        return {
          id: `loc-i-${(r.id || "").replace(/[^a-z0-9]/gi, "").slice(-16)}`,
          kind: "image" as const,
          thumbnail: thumb.startsWith("//") ? "https:" + thumb : thumb,
          previewUrl: preview.startsWith("//") ? "https:" + preview : preview,
          duration: 0,
          source: "loc",
          description: r.title || "",
        };
      })
      .filter(Boolean) as MediaItem[];
  } catch {
    return [];
  }
}

// iNaturalist: no key. Species/wildlife photos via taxa search.
export async function searchINaturalist(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(query)}&per_page=3&page=${page}`
    );
    const data = await res.json();
    const items = (data?.results || []).slice(0, 3);
    return items
      .map((t: any) => {
        const photo = t.default_photo;
        if (!photo?.medium_url) return null;
        return {
          id: `inat-i-${t.id}`,
          kind: "image" as const,
          thumbnail: photo.square_url || photo.medium_url,
          previewUrl: photo.medium_url.replace("medium", "large"),
          duration: 0,
          source: "inaturalist",
          description: `${t.preferred_common_name || t.name || ""} (license: ${photo.license_code || "?"})`,
        };
      })
      .filter(Boolean) as MediaItem[];
  } catch {
    return [];
  }
}

// Unsplash: free key, top-tier photo quality. Dev tier: 50 requests/hour.
export async function searchUnsplash(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) return [];
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&page=${page}`,
      { headers: { Authorization: `Client-ID ${key}` } }
    );
    const data = await res.json();
    if (!res.ok || !data.results) return [];
    return data.results.map((p: any) => ({
      id: `unsplash-i-${p.id}`,
      kind: "image" as const,
      thumbnail: p.urls?.small || p.urls?.thumb || "",
      previewUrl: p.urls?.regular || p.urls?.full || "",
      duration: 0,
      width: p.width,
      height: p.height,
      source: "unsplash",
      description: p.alt_description || p.description || "",
    })).filter((m: MediaItem) => m.previewUrl);
  } catch {
    return [];
  }
}

// Europeana: free key, aggregates European museums/archives/libraries.
export async function searchEuropeana(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const key = process.env.EUROPEANA_API_KEY;
    if (!key) return [];
    const res = await fetch(
      `https://api.europeana.eu/record/v2/search.json?wskey=${key}&query=${encodeURIComponent(query)}&rows=3&start=${(page - 1) * 3 + 1}&media=true&qf=TYPE:IMAGE`
    );
    const data = await res.json();
    if (!res.ok || !data.items) return [];
    return data.items
      .map((r: any) => {
        const thumb = Array.isArray(r.edmPreview) ? r.edmPreview[0] : r.edmPreview;
        const full = Array.isArray(r.edmIsShownBy) ? r.edmIsShownBy[0] : r.edmIsShownBy;
        if (!thumb && !full) return null;
        const title = Array.isArray(r.title) ? r.title[0] : r.title || "";
        return {
          id: `europeana-i-${(r.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-16)}`,
          kind: "image" as const,
          thumbnail: thumb || full,
          previewUrl: full || thumb,
          duration: 0,
          source: "europeana",
          description: title,
        };
      })
      .filter(Boolean) as MediaItem[];
  } catch {
    return [];
  }
}

// Smithsonian Open Access: free api.data.gov key. Museum artifacts, specimens, history.
export async function searchSmithsonian(query: string, page = 1): Promise<MediaItem[]> {
  try {
    const key = process.env.SMITHSONIAN_API_KEY;
    if (!key) return [];
    const res = await fetch(
      `https://api.si.edu/openaccess/api/v1.0/search?api_key=${key}&q=${encodeURIComponent(query)}&rows=3&start=${(page - 1) * 3}`
    );
    const data = await res.json();
    const rows = data?.response?.rows || [];
    return rows
      .map((r: any) => {
        const media = r?.content?.descriptiveNonRepeating?.online_media?.media?.[0];
        if (!media) return null;
        const full = media.content || media.resources?.[0]?.url || "";
        const thumb = media.thumbnail || full;
        if (!full && !thumb) return null;
        return {
          id: `si-i-${(r.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-16)}`,
          kind: "image" as const,
          thumbnail: thumb,
          previewUrl: full || thumb,
          duration: 0,
          source: "smithsonian",
          description: r?.title || "",
        };
      })
      .filter(Boolean) as MediaItem[];
  } catch {
    return [];
  }
}
