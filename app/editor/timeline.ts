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
export function deriveTimeline(beats: Beat[], narrationEnd?: number): {
  clips: TlClip[];
  beatWindows: BeatWindow[];
  total: number;
} {
  const clips: TlClip[] = [];
  const beatWindows: BeatWindow[] = [];
  let fallbackCursor = 0;

  beats.forEach((b, bi) => {
    // Anchor each beat to its NARRATION timestamp, not to the running total of
    // whatever footage happens to exist. Beat 5's visuals belong at beat 5's
    // spoken moment even if beats 1-4 are still empty.
    const hasTiming = b.end > b.start;
    const anchor = hasTiming ? b.start : fallbackCursor;
    let windowEnd = hasTiming ? b.end : anchor + b.duration;

    // Nothing may exist past the last spoken word: beat end-times can drift
    // beyond the narration, and clips would faithfully follow them out there
    if (narrationEnd && narrationEnd > 0) {
      if (anchor >= narrationEnd - 0.05) return; // beat starts after the voice ends
      windowEnd = Math.min(windowEnd, narrationEnd);
    }

    // Clips keep their FULL length; any that no longer fit in the beat's
    // narration window are dropped rather than squeezed. The last kept clip
    // stretches to cover whatever remains, so beats never open onto black.
    const room = Math.max(0, windowEnd - anchor);
    const kept: { c: (typeof b.selectedClips)[number]; len: number }[] = [];
    let used = 0;
    for (const c of b.selectedClips) {
      const len = c.trimEnd - c.trimStart;
      if (kept.length === 0 && len > room) {
        // A single clip longer than the whole beat: keep it, trimmed to fit
        kept.push({ c, len: room });
        used = room;
        break;
      }
      if (used + len > room + 0.05) continue; // doesn't fit: drop it
      kept.push({ c, len });
      used += len;
    }

    // Stretch the last kept clip into any leftover time
    if (kept.length > 0 && room - used > 0.05) {
      const last = kept[kept.length - 1];
      const srcLen = last.c.media.kind === "video" ? last.c.media.duration : Infinity;
      const maxLen = Math.min(room - used + last.len, srcLen - last.c.trimStart);
      if (maxLen > last.len) {
        used += maxLen - last.len;
        last.len = maxLen;
      }
    }

    let cursor = anchor;
    kept.forEach(({ c, len }, ci) => {
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
        trimEnd: c.trimStart + len,
        gap: c.gap === true,
      });
      cursor += len;
    });

    beatWindows.push({ beatIndex: bi, start: anchor, end: windowEnd, text: b.text });
    fallbackCursor = Math.max(windowEnd, cursor);
  });

  const total = beatWindows.reduce((mx, w) => Math.max(mx, w.end), 0);
  return { clips, beatWindows, total };
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
