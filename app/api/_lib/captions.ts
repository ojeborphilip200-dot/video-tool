import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";

type Word = { word: string; start: number; end: number };
type CaptionChunk = { text: string; start: number; end: number };

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

  // Transparent background
  ctx.clearRect(0, 0, videoWidth, videoHeight);

  const fontSize = Math.round(videoHeight * 0.055);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = videoWidth / 2;
  const y = videoHeight * 0.85;

  // Word-wrap the text if it's too wide
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

    // Black outline for readability over any background
    ctx.lineWidth = fontSize * 0.12;
    ctx.strokeStyle = "black";
    ctx.strokeText(line, x, lineY);

    // White fill text on top
    ctx.fillStyle = "white";
    ctx.fillText(line, x, lineY);
  });

  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outputPath, buffer);
}