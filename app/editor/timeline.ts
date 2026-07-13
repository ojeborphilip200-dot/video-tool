import { Beat } from "./store";

export type TlClip = {
  id: string;
  kind: "video" | "image";
  thumbnail: string;
  previewUrl: string;
  source: string;
  beatIndex: number;
  clipIndex: number;
  start: number;
  end: number;
  trimStart: number;
  trimEnd: number;
  gap: boolean;
};

export type BeatWindow = { beatIndex: number; start: number; end: number; text: string };

// THE canonical timing derivation. The browser preview and the FFmpeg export
// payload both consume this - same numbers by construction.
export function deriveTimeline(beats: Beat[]): {
  clips: TlClip[];
  beatWindows: BeatWindow[];
  total: number;
} {
  const clips: TlClip[] = [];
  const beatWindows: BeatWindow[] = [];
  let cursor = 0;

  beats.forEach((b, bi) => {
    const beatStart = cursor;
    b.selectedClips.forEach((c, ci) => {
      const len = c.trimEnd - c.trimStart;
      clips.push({
        id: c.media.id,
        kind: c.media.kind,
        thumbnail: c.media.thumbnail,
        previewUrl: c.media.previewUrl,
        source: c.media.source,
        beatIndex: bi,
        clipIndex: ci,
        start: cursor,
        end: cursor + len,
        trimStart: c.trimStart,
        trimEnd: c.trimEnd,
        gap: c.gap === true,
      });
      cursor += len;
    });
    if (cursor > beatStart) {
      beatWindows.push({ beatIndex: bi, start: beatStart, end: cursor, text: b.text });
    }
  });

  return { clips, beatWindows, total: cursor };
}

// Word-synced caption chunks (5 words), same grouping the ASS generator uses
export function deriveCaptionChunks(
  words: { word: string; start: number; end: number }[]
): { text: string; start: number; end: number; wordStart: number; wordEnd: number }[] {
  const chunks: { text: string; start: number; end: number; wordStart: number; wordEnd: number }[] = [];
  for (let i = 0; i < words.length; i += 5) {
    const slice = words.slice(i, i + 5);
    if (slice.length === 0) continue;
    chunks.push({
      text: slice.map((w) => w.word).join(" "),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      wordStart: i,
      wordEnd: i + slice.length - 1,
    });
  }
  return chunks;
}
