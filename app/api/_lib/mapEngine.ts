// Shared map-animation engine. Pure geometry: config + time t -> SVG frame.
// Browser preview and server rasterizer both call THIS - sync by construction.

export type MapLocation = { name: string; lat: number; lon: number };

export type MapConfig = {
  template: "route" | "reveal" | "sequence" | "region" | "spread";
  style?: "default" | "dark" | "political";
  locations: MapLocation[];
  region?: string; // for "region": country/region name to highlight
  durationSec: number;
};

type XY = [number, number];

type MapTheme = { OCEAN: string; LAND: string; BORDER: string; ACCENT: string; ACCENT_FILL: string; MARKER: string };

const MAP_THEMES: Record<string, MapTheme> = {
  // Current look: deep navy ocean, blue accent
  default: {
    OCEAN: "#0b0c0f", LAND: "#1a1e24", BORDER: "#2c323b",
    ACCENT: "#5b8cff", ACCENT_FILL: "rgba(91,140,255,0.28)", MARKER: "#ff8a65",
  },
  // Vox / Johnny Harris cinematic: near-black ocean, muted land, bright red highlight
  dark: {
    OCEAN: "#05070a", LAND: "#161a1f", BORDER: "#232830",
    ACCENT: "#ff2e2e", ACCENT_FILL: "rgba(255,46,46,0.30)", MARKER: "#ff2e2e",
  },
  // Political: flat clean colors, soft borders, red highlight on pale land
  political: {
    OCEAN: "#afcbe3", LAND: "#e9e4d8", BORDER: "#b8b0a0",
    ACCENT: "#d13b3b", ACCENT_FILL: "rgba(209,59,59,0.32)", MARKER: "#d13b3b",
  },
};

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}
function clamp01(u: number): number {
  return Math.max(0, Math.min(1, u));
}

export function createMapRenderer(
  world: any,
  config: MapConfig,
  width = 1280,
  height = 720
): (t: number) => string {
  const T = MAP_THEMES[config.style || "default"] || MAP_THEMES.default;
  const OCEAN = T.OCEAN, LAND = T.LAND, BORDER = T.BORDER, ACCENT = T.ACCENT, ACCENT_FILL = T.ACCENT_FILL, MARKER = T.MARKER;

  const template = config.template || "route";

  // ---- Country alias resolver: "USA"/"UK"/"South Korea"/"Czechia" etc. map to
  // the canonical GeoJSON name before any loose matching runs ----
  const COUNTRY_ALIASES: Record<string, string> = {
    usa: "united states", "u.s.": "united states", "u.s.a.": "united states",
    us: "united states", america: "united states", "united states of america": "united states",
    uk: "united kingdom", britain: "united kingdom", "great britain": "united kingdom",
    england: "united kingdom", "u.k.": "united kingdom",
    "south korea": "korea", "republic of korea": "korea",
    "north korea": "korea", "dprk": "korea",
    "ivory coast": "cote d'ivoire", "côte d'ivoire": "cote d'ivoire",
    "czech republic": "czechia", czechia: "czech republic",
    burma: "myanmar", holland: "netherlands", "the netherlands": "netherlands",
    uae: "united arab emirates", "u.a.e.": "united arab emirates",
    drc: "democratic republic of the congo", "dr congo": "democratic republic of the congo",
    russia: "russia", "russian federation": "russia",
    "vatican": "vatican", "vatican city": "vatican",
  };
  const ISO_MAP: Record<string, string> = {
    us: "united states", gb: "united kingdom", fr: "france", de: "germany",
    it: "italy", es: "spain", cn: "china", jp: "japan", in: "india", br: "brazil",
    ru: "russia", ca: "canada", au: "australia", mx: "mexico", co: "colombia",
    nz: "new zealand", kr: "korea", kp: "korea", ci: "cote d'ivoire", cz: "czechia",
    usa: "united states", gbr: "united kingdom", fra: "france", deu: "germany",
    col: "colombia", nzl: "new zealand", kor: "korea", civ: "cote d'ivoire",
  };

  // ---- Region matching (for "region" template + camera) ----
  const rawRegion = (config.region || "").toLowerCase().trim();
  const regionName = COUNTRY_ALIASES[rawRegion] || ISO_MAP[rawRegion] || rawRegion;
  const isRegionFeature = (f: any) => {
    if (!regionName) return false;
    const n = String(f?.properties?.name || "").toLowerCase();
    return n.includes(regionName) || regionName.includes(n);
  };
  const regionFeatures = regionName ? (world.features || []).filter(isRegionFeature) : [];

  // ---- Camera bounds ----
  let pts: { lat: number; lon: number }[] = config.locations.map((l) => ({ lat: l.lat, lon: l.lon }));
  if (template === "region" && regionFeatures.length > 0) {
    for (const f of regionFeatures) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) {
        for (let i = 0; i < poly[0].length; i += 5) {
          pts.push({ lon: poly[0][i][0], lat: poly[0][i][1] });
        }
      }
    }
  }
  if (pts.length === 0) pts = [{ lat: 20, lon: 0 }];

  let minLat = Math.min(...pts.map((p) => p.lat)), maxLat = Math.max(...pts.map((p) => p.lat));
  let minLon = Math.min(...pts.map((p) => p.lon)), maxLon = Math.max(...pts.map((p) => p.lon));
  const spanLat0 = Math.max(maxLat - minLat, template === "reveal" ? 14 : 8);
  const spanLon0 = Math.max(maxLon - minLon, template === "reveal" ? 22 : 12);
  minLat -= spanLat0 * 0.35; maxLat += spanLat0 * 0.35;
  minLon -= spanLon0 * 0.3; maxLon += spanLon0 * 0.3;

  const targetRatio = width / height;
  let lonSpan = maxLon - minLon, latSpan = maxLat - minLat;
  if (lonSpan / latSpan < targetRatio) {
    const need = latSpan * targetRatio - lonSpan;
    minLon -= need / 2; maxLon += need / 2; lonSpan = maxLon - minLon;
  } else {
    const need = lonSpan / targetRatio - latSpan;
    minLat -= need / 2; maxLat += need / 2; latSpan = maxLat - minLat;
  }

  const project = (lon: number, lat: number): XY => [
    ((lon - minLon) / lonSpan) * width,
    ((maxLat - lat) / latSpan) * height,
  ];

  // ---- Land layers ----
  const landPaths: string[] = [];
  const regionPaths: string[] = [];
  for (const f of world.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const isR = template === "region" && isRegionFeature(f);
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring || ring.length < 8) continue;
      const step = Math.max(1, Math.floor(ring.length / 300));
      let inView = false;
      const proj: XY[] = [];
      for (let i = 0; i < ring.length; i += step) {
        const [lon, lat] = ring[i];
        if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) inView = true;
        proj.push(project(lon, lat));
      }
      if (!inView) continue;
      const d = "M" + proj.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z";
      (isR ? regionPaths : landPaths).push(d);
    }
  }
  const landSvg = landPaths.map((d) => `<path d="${d}" fill="${LAND}" stroke="${BORDER}" stroke-width="1"/>`).join("");

  const anchors = config.locations.map((l) => project(l.lon, l.lat));

  // ---- Route sampling (route template) ----
  const samples: XY[] = [];
  const legOffsets: number[] = [0];
  if (template === "route" && anchors.length > 1) {
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      const mx = (a[0] + b[0]) / 2;
      const lift = Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22, 80);
      const cy = (a[1] + b[1]) / 2 - lift;
      const SEG = 48;
      for (let s = i === 0 ? 0 : 1; s <= SEG; s++) {
        const u = s / SEG;
        samples.push([
          (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * mx + u * u * b[0],
          (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * cy + u * u * b[1],
        ]);
      }
      legOffsets.push(samples.length - 1);
    }
  }

  function marker(p: XY, color: string, pulse: number, scale = 1): string {
    const r = (5 + pulse * 9) * scale;
    return (
      `<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="none" stroke="${color}" stroke-width="2" opacity="${(1 - pulse) * 0.6}"/>` +
      `<circle cx="${p[0]}" cy="${p[1]}" r="${5.5 * scale}" fill="${color}" stroke="#0b0c0f" stroke-width="2"/>`
    );
  }

  function label(p: XY, name: string, opacity: number, big = false): string {
    if (opacity <= 0) return "";
    const fs = big ? 15 : 12;
    const w = name.length * (fs * 0.66) + 22;
    const x = p[0] - w / 2, y = p[1] - (big ? 42 : 34);
    const h = big ? 26 : 22;
    return (
      `<g opacity="${opacity.toFixed(2)}">` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#101216" stroke="rgba(255,255,255,0.14)"/>` +
      `<text x="${p[0]}" y="${y + h / 2 + fs * 0.36}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" font-weight="600" fill="#f1f2f4">${name}</text>` +
      `</g>`
    );
  }

  function wrap(inner: string, k: number, center: XY): string {
    return (
      `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${width}" height="${height}" fill="${OCEAN}"/>` +
      `<g transform="translate(${center[0]},${center[1]}) scale(${k.toFixed(4)}) translate(${-center[0]},${-center[1]})">` +
      inner +
      `</g></svg>`
    );
  }

  const dur = config.durationSec;

  // ================= Templates =================

  if (template === "reveal") {
    const p0 = anchors[0] || [width / 2, height / 2];
    return (t: number) => {
      const zp = ease(clamp01(t / (dur * 0.6)));
      const k = 1 + 0.45 * zp;
      const pulse = (t % 1.6) / 1.6;
      const inner =
        landSvg +
        marker(p0, MARKER, pulse, 1 + zp * 0.2) +
        label(p0, config.locations[0]?.name || "", clamp01((t - dur * 0.25) / 0.5), true);
      return wrap(inner, k, p0);
    };
  }

  if (template === "sequence") {
    const n = Math.max(1, anchors.length);
    return (t: number) => {
      const pulse = (t % 1.6) / 1.6;
      let inner = landSvg;
      const per = (dur * 0.8) / n;
      for (let i = 0; i < n; i++) {
        const at = i * per + 0.3;
        if (t >= at) {
          const pop = ease(clamp01((t - at) / 0.35));
          inner += marker(anchors[i], i === 0 ? MARKER : ACCENT, pulse, 0.6 + pop * 0.4);
          inner += label(anchors[i], config.locations[i].name, pop);
        }
      }
      const k = 1 + 0.06 * ease(clamp01(t / dur));
      return wrap(inner, k, [width / 2, height / 2]);
    };
  }

  if (template === "region") {
    // Camera pushes from a wide regional view (framed by the auto-fit bounds)
    // to a tight framing centered on the country. p0 is the country's centroid.
    let cx = 0, cy = 0;
    if (regionFeatures.length > 0) {
      // centroid of the region's projected bounding box
      let rMinLat = 90, rMaxLat = -90, rMinLon = 180, rMaxLon = -180;
      for (const f of regionFeatures) {
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const poly of polys) {
          for (const [lon, lat] of poly[0]) {
            rMinLat = Math.min(rMinLat, lat); rMaxLat = Math.max(rMaxLat, lat);
            rMinLon = Math.min(rMinLon, lon); rMaxLon = Math.max(rMaxLon, lon);
          }
        }
      }
      const c = project((rMinLon + rMaxLon) / 2, (rMinLat + rMaxLat) / 2);
      cx = c[0]; cy = c[1];
    } else {
      cx = width / 2; cy = height / 2;
    }

    return (t: number) => {
      const prog = clamp01(t / dur);
      // 0-20% wide, 20-55% push in, hold after
      const push = ease(clamp01((prog - 0.2) / 0.35));
      const k = 1 + 1.15 * push; // 1x (wide) -> ~2.15x (tight on country)

      // Highlight animates in over 35-60%
      const hi = ease(clamp01((prog - 0.35) / 0.25));
      const breathe = 0.78 + 0.22 * Math.sin((t / 2.2) * Math.PI * 2);
      const regionSvg = regionPaths
        .map(
          (d) =>
            `<path d="${d}" fill="${LAND}" stroke="${BORDER}" stroke-width="1" opacity="${(1 - hi).toFixed(2)}"/>` +
            `<path d="${d}" fill="${ACCENT_FILL}" stroke="${ACCENT}" stroke-width="2.5" opacity="${(hi * breathe).toFixed(2)}"/>`
        )
        .join("");
      const dim = `<rect width="${width}" height="${height}" fill="rgba(0,0,0,${(hi * 0.3).toFixed(2)})"/>`;

      // Label scales + fades in over 50-70%, anchored near the country
      const labelP = ease(clamp01((prog - 0.3) / 0.18));
      let lbl = "";
      if (config.region && labelP > 0) {
        const name = config.region.toUpperCase();
        const fs = 15;
        const w = name.length * (fs * 0.7) + 26;
        const lx = width / 2, ly = height * 0.15;
        const scale = 0.85 + 0.15 * labelP;
        lbl =
          `<g opacity="${labelP.toFixed(2)}" transform="translate(${lx},${ly}) scale(${scale.toFixed(3)}) translate(${-lx},${-ly})">` +
          `<rect x="${lx - w / 2}" y="${ly - 16}" width="${w}" height="30" rx="15" fill="#101216" stroke="${ACCENT}" stroke-width="1.5"/>` +
          `<text x="${lx}" y="${ly + 5}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" font-weight="700" letter-spacing="2" fill="#f1f2f4">${name}</text>` +
          `</g>`;
      }

      // Zoom toward the country's centroid, not the frame center
      return wrap(landSvg + dim + regionSvg + lbl, k, [cx, cy]);
    };
  }

  if (template === "spread") {
    const origin = anchors[0] || [width / 2, height / 2];
    const targets = anchors.slice(1);
    const maxDist = Math.max(60, ...targets.map((p) => Math.hypot(p[0] - origin[0], p[1] - origin[1])));
    return (t: number) => {
      const p = ease(clamp01(t / (dur * 0.8)));
      const radius = p * maxDist * 1.15;
      const pulse = (t % 1.6) / 1.6;
      let inner = landSvg;
      // expanding wavefronts
      for (let w = 0; w < 3; w++) {
        const r = radius - w * (maxDist * 0.16);
        if (r > 4) {
          inner += `<circle cx="${origin[0]}" cy="${origin[1]}" r="${r.toFixed(1)}" fill="none" stroke="${ACCENT}" stroke-width="${2 - w * 0.5}" opacity="${(0.5 - w * 0.14).toFixed(2)}"/>`;
        }
      }
      inner += `<circle cx="${origin[0]}" cy="${origin[1]}" r="${(radius * 0.55).toFixed(1)}" fill="${ACCENT_FILL}" opacity="0.35"/>`;
      inner += marker(origin, MARKER, pulse);
      inner += label(origin, config.locations[0]?.name || "", clamp01(t / 0.5));
      for (let i = 0; i < targets.length; i++) {
        const d = Math.hypot(targets[i][0] - origin[0], targets[i][1] - origin[1]);
        if (radius >= d) {
          const pop = ease(clamp01((radius - d) / 40));
          inner += marker(targets[i], ACCENT, pulse, 0.6 + pop * 0.4);
          inner += label(targets[i], config.locations[i + 1].name, pop);
        }
      }
      const k = 1 + 0.07 * ease(clamp01(t / dur));
      return wrap(inner, k, origin);
    };
  }

  // ---- default: route ----
  return (t: number) => {
    const p = ease(clamp01(t / (dur * 0.78)));
    const visCount = Math.max(1, Math.floor(p * Math.max(1, samples.length)));
    const vis = samples.slice(0, visCount);
    const head = vis[vis.length - 1] || anchors[0] || [width / 2, height / 2];

    const routeSvg =
      vis.length > 1
        ? `<polyline points="${vis.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ")}" fill="none" stroke="${ACCENT}" stroke-width="3.5" stroke-linecap="round" opacity="0.95"/>`
        : "";

    const pulse = (t % 1.6) / 1.6;
    let markers = anchors[0] ? marker(anchors[0], MARKER, pulse) + label(anchors[0], config.locations[0].name, clamp01(t / 0.5)) : "";
    for (let i = 1; i < anchors.length; i++) {
      const reachedAt = legOffsets[i] / Math.max(1, samples.length - 1);
      if (p >= reachedAt) {
        markers += marker(anchors[i], i === anchors.length - 1 ? MARKER : ACCENT, pulse);
        markers += label(anchors[i], config.locations[i].name, clamp01((p - reachedAt) * 8));
      }
    }
    const headDot = p < 1 && samples.length > 1 ? `<circle cx="${head[0]}" cy="${head[1]}" r="6" fill="#fff"/>` : "";
    const k = 1 + 0.08 * ease(clamp01(t / dur));
    return wrap(landSvg + routeSvg + headDot + markers, k, [width / 2, height / 2]);
  };
}
