// Shared map-animation engine. Pure geometry: takes a config + time t and
// returns the SVG for that exact frame. The browser preview and the server
// rasterizer both call THIS function - synchronization by construction.

export type MapLocation = { name: string; lat: number; lon: number };

export type MapConfig = {
  template: "route";
  locations: MapLocation[]; // origin, optional stops..., destination
  durationSec: number;
};

type XY = [number, number];

const OCEAN = "#0b0c0f";
const LAND = "#1a1e24";
const BORDER = "#2c323b";
const ACCENT = "#5b8cff";
const MARKER = "#ff8a65";

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export function createMapRenderer(
  world: any,
  config: MapConfig,
  width = 1280,
  height = 720
): (t: number) => string {
  // ---- Camera: fit all locations with padding, locked to 16:9 ----
  const lats = config.locations.map((l) => l.lat);
  const lons = config.locations.map((l) => l.lon);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const spanLat0 = Math.max(maxLat - minLat, 8);
  const spanLon0 = Math.max(maxLon - minLon, 12);
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

  // ---- Static land layer: projected once, reused every frame ----
  const landPaths: string[] = [];
  for (const f of world.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring || ring.length < 8) continue;
      const step = Math.max(1, Math.floor(ring.length / 300));
      let inView = false;
      const pts: XY[] = [];
      for (let i = 0; i < ring.length; i += step) {
        const [lon, lat] = ring[i];
        if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) inView = true;
        pts.push(project(lon, lat));
      }
      if (!inView) continue;
      landPaths.push("M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z");
    }
  }
  const landSvg = landPaths
    .map((d) => `<path d="${d}" fill="${LAND}" stroke="${BORDER}" stroke-width="1"/>`)
    .join("");

  // ---- Route: quadratic arcs between consecutive stops, densely sampled ----
  const anchors = config.locations.map((l) => project(l.lon, l.lat));
  const samples: XY[] = [];
  const legOffsets: number[] = [0];
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

  function marker(p: XY, color: string, pulse: number): string {
    const r = 5 + pulse * 9;
    return (
      `<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="none" stroke="${color}" stroke-width="2" opacity="${(1 - pulse) * 0.6}"/>` +
      `<circle cx="${p[0]}" cy="${p[1]}" r="5.5" fill="${color}" stroke="#0b0c0f" stroke-width="2"/>`
    );
  }

  function label(p: XY, name: string, opacity: number): string {
    if (opacity <= 0) return "";
    const w = name.length * 8 + 20;
    const x = p[0] - w / 2, y = p[1] - 34;
    return (
      `<g opacity="${opacity.toFixed(2)}">` +
      `<rect x="${x}" y="${y}" width="${w}" height="22" rx="11" fill="#101216" stroke="rgba(255,255,255,0.14)"/>` +
      `<text x="${p[0]}" y="${y + 15}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="600" fill="#f1f2f4">${name}</text>` +
      `</g>`
    );
  }

  // ---- Frame at time t ----
  return function frame(t: number): string {
    const dur = config.durationSec;
    const p = ease(Math.max(0, Math.min(1, t / (dur * 0.78)))); // route completes at 78%, then holds
    const visCount = Math.max(1, Math.floor(p * samples.length));
    const vis = samples.slice(0, visCount);
    const head = vis[vis.length - 1];

    const routeSvg =
      vis.length > 1
        ? `<polyline points="${vis.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ")}" fill="none" stroke="${ACCENT}" stroke-width="3.5" stroke-linecap="round" opacity="0.95"/>`
        : "";

    const pulse = (t % 1.6) / 1.6;
    let markers = marker(anchors[0], MARKER, pulse);
    markers += label(anchors[0], config.locations[0].name, Math.min(1, t / 0.5));
    for (let i = 1; i < anchors.length; i++) {
      const reachedAt = legOffsets[i] / (samples.length - 1);
      if (p >= reachedAt) {
        markers += marker(anchors[i], i === anchors.length - 1 ? MARKER : ACCENT, pulse);
        markers += label(anchors[i], config.locations[i].name, Math.min(1, (p - reachedAt) * 8));
      }
    }
    const headDot = p < 1 ? `<circle cx="${head[0]}" cy="${head[1]}" r="6" fill="#fff"/>` : "";

    // Gentle zoom-in over the animation
    const k = 1 + 0.08 * ease(Math.min(1, t / dur));
    const cx = width / 2, cy = height / 2;

    return (
      `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${width}" height="${height}" fill="${OCEAN}"/>` +
      `<g transform="translate(${cx},${cy}) scale(${k.toFixed(4)}) translate(${-cx},${-cy})">` +
      landSvg +
      routeSvg +
      headDot +
      markers +
      `</g>` +
      `</svg>`
    );
  };
}
