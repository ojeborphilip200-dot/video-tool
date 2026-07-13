import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CACHE_DIR = path.join(process.cwd(), ".clip-cache");
const HF_DIR = path.join(process.cwd(), "hf-overlays");

const THEMES: Record<string, { font: string; bg: string; border: string; color: string }> = {
  standard:   { font: "Arial, sans-serif",      bg: "#ffffff",     border: "#ffffff",                color: "#000000" },
  crime:      { font: "'Arial Narrow', Arial",  bg: "#101010",     border: "#e83c3c",                color: "#e83c3c" },
  history:    { font: "Georgia, serif",         bg: "#e8dfc8",     border: "#c9bfa5",                color: "#3c2d1e" },
  modern:     { font: "'Helvetica Neue', Arial", bg: "#4f7cff",    border: "#4f7cff",                color: "#ffffff" },
  minimalist: { font: "'Helvetica Neue', Arial", bg: "transparent", border: "rgba(255,255,255,0.8)", color: "#ffffff" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CALLOUT_POSITIONS: Record<string, string> = {
  "top-center": "top: 16%;",
  "top-left": "top: 20%;",
  "top-right": "top: 38%;",
  "mid-left": "top: 44%;",
  "mid-right": "top: 30%;",
  "low-center": "top: 58%;",
};

function calloutHtml(id: string, text: string, theme: string, dur: number, pos: string): string {
  const d = Math.min(Math.max(dur, 1.2), 5.5);
  const posCss = CALLOUT_POSITIONS[pos] || CALLOUT_POSITIONS["top-left"];
  // Long phrases scale down gently so they keep a clean one-or-two-line layout
  const chars = text.length;
  const fontSize = chars <= 14 ? 62 : chars <= 22 ? 56 : chars <= 32 ? 50 : 44;
  return `<div id="root" data-composition-id="${id}" data-start="0" data-width="1280" data-height="720" data-fps="25">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=block" rel="stylesheet">
  <div id="pill" class="clip" data-start="0" data-duration="${(d + 0.2).toFixed(2)}" data-track-index="0"
       style="position: absolute; ${posCss} left: 50%; transform: translate(-50%, 0);
              width: 94%; text-align: center; opacity: 0;">
    <span id="txt" style="font-family: 'Montserrat', 'Arial Black', 'Helvetica Neue', sans-serif;
                          font-weight: 800; font-size: ${fontSize}px; line-height: 1.12;
                          letter-spacing: 2px; color: #ffffff;
                          text-shadow: 0 3px 10px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6);">${esc(text.toUpperCase())}</span>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.to("#pill", { opacity: 1, duration: 0.01 }, 0)
      .from("#pill", { scale: 1.22, duration: 0.22, ease: "power3.out" }, 0)
      .from("#txt", { y: 14, opacity: 0, letterSpacing: "8px", duration: 0.26, ease: "power2.out" }, 0.02)
      .to("#pill", { opacity: 0, y: -12, duration: 0.35, ease: "power2.in" }, ${(d - 0.35).toFixed(2)});
    window.__timelines = window.__timelines || {};
    window.__timelines["${id}"] = tl;
  </script>
</div>`;
}

function countupHtml(
  id: string,
  v: { value: number; prefix: string; suffix: string; decimals: number; compact: boolean; countDur: number; hold: number; theme: string }
): string {
  const countDur = Math.min(Math.max(v.countDur, 1), 5);
  const hold = Math.min(Math.max(v.hold, 0.5), 2);
  const total = 0.1 + countDur + hold + 0.4;
  return `<div id="root" data-composition-id="${id}" data-start="0" data-width="1280" data-height="720" data-fps="25">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=block" rel="stylesheet">
  <div id="wrap" class="clip" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="0"
       style="position: absolute; top: 14%; left: 50%; transform: translate(-50%, 0);
              width: 94%; text-align: center; opacity: 0;">
    <span id="num" style="font-family: 'Montserrat', 'Arial Black', 'Helvetica Neue', sans-serif;
                          font-weight: 800; font-size: 96px; letter-spacing: 2px;
                          white-space: nowrap; color: #ffffff;
                          text-shadow: 0 3px 10px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6);"></span>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const V = ${JSON.stringify(v)};
    const num = document.getElementById("num");
    function fmt(x) {
      const abs = Math.abs(x);
      let s;
      if (V.compact) {
        if (abs >= 1e9) s = (x / 1e9).toFixed(abs / 1e9 >= 10 ? 0 : 1).replace(/\\.0$/, "") + "B";
        else if (abs >= 1e6) s = (x / 1e6).toFixed(abs / 1e6 >= 10 ? 0 : 1).replace(/\\.0$/, "") + "M";
        else if (abs >= 1e4) s = (x / 1e3).toFixed(0) + "K";
        else s = Math.round(x).toLocaleString("en-US");
      } else if (V.decimals > 0) {
        s = x.toFixed(V.decimals);
      } else {
        s = Math.round(x).toLocaleString("en-US");
      }
      return V.prefix + s + V.suffix;
    }
    const state = { n: 0 };
    num.textContent = fmt(0);
    const tl = gsap.timeline({ paused: true });
    tl.to("#wrap", { opacity: 1, duration: 0.18, ease: "power2.out" }, 0)
      .from("#wrap", { scale: 1.18, duration: 0.22, ease: "power3.out" }, 0)
      .to(state, { n: V.value, duration: ${countDur.toFixed(2)}, ease: "power3.out",
                   onUpdate: () => { num.textContent = fmt(state.n); } }, 0.08)
      .to("#num", { scale: 1.05, duration: 0.15, ease: "power2.out" }, ${(0.08 + countDur).toFixed(2)})
      .to("#num", { scale: 1, duration: 0.2 }, ${(0.23 + countDur).toFixed(2)})
      .to("#wrap", { opacity: 0, y: -14, duration: 0.35, ease: "power2.in" }, ${(0.08 + countDur + hold).toFixed(2)});
    window.__timelines = window.__timelines || {};
    window.__timelines["${id}"] = tl;
  </script>
</div>`;
}

// Renders a themed text overlay to a cached transparent WebM. Values are baked
// into a generated composition file - no dependency on CLI variable flags.
export async function buildTextOverlay(
  type: "callout" | "countup",
  variables: Record<string, string | number | boolean>
): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const key = crypto
    .createHash("sha1")
    .update(type + "::" + JSON.stringify(variables))
    .digest("hex");
  const outPath = path.join(CACHE_DIR, `hfov-${key}.webm`);

  try {
    await fs.access(outPath);
    return outPath;
  } catch {
    // build it
  }

  const compId = `gen-${key.slice(0, 10)}`;
  const html =
    type === "callout"
      ? calloutHtml(compId, String(variables.text ?? ""), String(variables.theme ?? "standard"), Number(variables.dur ?? 4), String(variables.pos ?? "top-left"))
      : countupHtml(compId, {
          value: Number(variables.value ?? 0),
          prefix: String(variables.prefix ?? ""),
          suffix: String(variables.suffix ?? ""),
          decimals: Number(variables.decimals ?? 0),
          compact: Boolean(variables.compact ?? true),
          countDur: Number(variables.countDur ?? 3),
          hold: Number(variables.hold ?? 1.5),
          theme: String(variables.theme ?? "standard"),
        });

  const genRel = `compositions/_${compId}.html`;
  const genAbs = path.join(HF_DIR, genRel);
  await fs.writeFile(genAbs, html);

  try {
    const tmpOut = `${outPath}.tmp.webm`;
    await execAsync(
      `npx hyperframes render . -c ${genRel} --format webm --fps 25 --output "${tmpOut}" --quiet`,
      { cwd: HF_DIR, maxBuffer: 1024 * 1024 * 50, timeout: 5 * 60 * 1000 }
    );
    await fs.rename(tmpOut, outPath);
  } finally {
    await fs.rm(genAbs, { force: true });
  }

  return outPath;
}
