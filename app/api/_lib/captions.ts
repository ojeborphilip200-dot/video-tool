import { createCanvas, registerFont } from "canvas";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";

type Word = { word: string; start: number; end: number };
type CaptionChunk = { text: string; start: number; end: number };
export type Callout = { text: string; start: number; end: number };
export type Position =
  | "top-left"
  | "top-right"
  | "top-center"
  | "middle-left"
  | "middle-right"
  | "middle-center";

const FONT_FAMILIES = ["Poppins", "Bebas Neue", "Anton", "Playfair Display", "Oswald"];
const fontCacheDir = path.join(os.tmpdir(), "video-tool-fonts");
let fontsRegistered: string[] = [];

async function ensureFontsLoaded(): Promise<string[]> {
  if (fontsRegistered.length > 0) return fontsRegistered;

  await fs.mkdir(fontCacheDir, { recursive: true });

  const apiKey = process.env.GOOGLE_FONTS_API_KEY;
  if (!apiKey) {
    fontsRegistered = ["sans-serif"];
    return fontsRegistered;
  }

  for (const family of FONT_FAMILIES) {
    try {
      const localPath = path.join(fontCacheDir, `${family.replace(/\s+/g, "-")}.ttf`);

      if (!fsSync.existsSync(localPath)) {
        const metaRes = await fetch(
          `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&family=${encodeURIComponent(family)}`
        );
        const meta = await metaRes.json();
        const fontEntry = meta.items?.[0];
        const fileUrl = fontEntry?.files?.["700"] || fontEntry?.files?.regular;
        if (!fileUrl) continue;

        const fileRes = await fetch(fileUrl.replace("http://", "https://"));
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        await fs.writeFile(localPath, buffer);
      }

      registerFont(localPath, { family });
      fontsRegistered.push(family);
    } catch {
      // Skip this font if download/registration fails; others still work
    }
  }

  if (fontsRegistered.length === 0) fontsRegistered = ["sans-serif"];
  return fontsRegistered;
}

export async function getRandomFont(): Promise<string> {
  const fonts = await ensureFontsLoaded();
  return fonts[Math.floor(Math.random() * fonts.length)];
}

const CALLOUT_POSITIONS: Position[] = [
  "top-left",
  "top-right",
  "top-center",
  "middle-left",
  "middle-right",
];

export function getRandomPosition(): Position {
  return CALLOUT_POSITIONS[Math.floor(Math.random() * CALLOUT_POSITIONS.length)];
}

export function positionToOverlayExpr(position: Position, margin = 40) {
  switch (position) {
    case "top-left":
      return { x: `${margin}`, y: `main_h*0.06` };
    case "top-right":
      return { x: `main_w-overlay_w-${margin}`, y: `main_h*0.06` };
    case "top-center":
      return { x: `main_w/2-overlay_w/2`, y: `main_h*0.06` };
    case "middle-left":
      return { x: `${margin}`, y: `main_h*0.4-overlay_h/2` };
    case "middle-right":
      return { x: `main_w-overlay_w-${margin}`, y: `main_h*0.4-overlay_h/2` };
    case "middle-center":
      return { x: `main_w/2-overlay_w/2`, y: `main_h*0.4-overlay_h/2` };
  }
}

export function groupWordsIntoCaptions(words: Word[], wordsPerChunk = 5): CaptionChunk[] {
  const chunks: CaptionChunk[] = [];

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const slice = words.slice(i, i + wordsPerChunk);
    if (slice.length === 0) continue;

    chunks.push({
      text: slice.map((w) => w.word).join(" "),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
  }

  return chunks;
}

export async function generateCaptionImage(
  text: string,
  outputPath: string,
  videoWidth: number,
  videoHeight: number
): Promise<void> {
  const canvas = createCanvas(videoWidth, videoHeight);
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, videoWidth, videoHeight);

  const fontSize = Math.round(videoHeight * 0.055);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = videoWidth / 2;
  const y = videoHeight * 0.85;

  const maxWidth = videoWidth * 0.85;
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.3;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, i) => {
    const lineY = startY + i * lineHeight;

    ctx.lineWidth = fontSize * 0.12;
    ctx.strokeStyle = "black";
    ctx.strokeText(line, x, lineY);

    ctx.fillStyle = "white";
    ctx.fillText(line, x, lineY);
  });

  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outputPath, buffer);
}

export function detectYearCallouts(words: Word[]): Callout[] {
  const callouts: Callout[] = [];
  const yearPattern = /\b(1[5-9]\d{2}|20\d{2})\b/;

  for (const w of words) {
    const cleaned = w.word.replace(/[^\d]/g, "");
    if (yearPattern.test(cleaned)) {
      callouts.push({ text: cleaned, start: w.start, end: w.end + 2 });
    }
  }

  return callouts;
}

export async function detectLocationCallouts(
  script: string,
  words: Word[]
): Promise<Callout[]> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Extract every specific place name (city, country, region, landmark) mentioned in this script. Respond ONLY with a JSON array of strings, exact wording as it appears in the text, no other text. If none, respond with [].\n\nScript:\n${script}`,
      },
    ],
  });

  const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
  const cleaned = rawText.replace(/```json|```/g, "").trim();

  let locationNames: string[] = [];
  try {
    locationNames = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const callouts: Callout[] = [];

  for (const location of locationNames) {
    const locationWords = location.toLowerCase().split(/\s+/);
    const firstWord = locationWords[0];

    for (let i = 0; i < words.length; i++) {
      const cleanedWord = words[i].word.toLowerCase().replace(/[^a-z]/g, "");
      if (cleanedWord === firstWord.replace(/[^a-z]/g, "")) {
        const start = words[i].start;
        const endIndex = Math.min(i + locationWords.length - 1, words.length - 1);
        const end = words[endIndex].end;
        callouts.push({ text: location.toUpperCase(), start, end: end + 2 });
        break;
      }
    }
  }

  return callouts;
}

export async function generateCalloutImage(
  text: string,
  outputPath: string,
  videoHeight: number
): Promise<void> {
  const font = await getRandomFont();
  const fontSize = Math.round(videoHeight * 0.04);
  const paddingX = fontSize * 0.9;
  const paddingY = fontSize * 0.55;

  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = `bold ${fontSize}px "${font}"`;
  const textWidth = measureCtx.measureText(text).width;

  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;

  const canvas = createCanvas(boxWidth, boxHeight);
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, boxWidth, boxHeight);

  const radius = boxHeight * 0.2;
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(boxWidth, 0, boxWidth, boxHeight, radius);
  ctx.arcTo(boxWidth, boxHeight, 0, boxHeight, radius);
  ctx.arcTo(0, boxHeight, 0, 0, radius);
  ctx.arcTo(0, 0, boxWidth, 0, radius);
  ctx.closePath();
  ctx.fill();

  ctx.font = `bold ${fontSize}px "${font}"`;
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), boxWidth / 2, boxHeight / 2);

  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outputPath, buffer);
}