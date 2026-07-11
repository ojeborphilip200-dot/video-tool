type Word = { word: string; start: number; end: number };
export type Callout = { text: string; start: number; end: number };

function toAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, " ");
}

// Random position for callouts, avoiding the bottom caption zone.
// ASS \an tags: 4=middle-left, 5=middle-center, 6=middle-right, 7=top-left, 8=top-center, 9=top-right
const CALLOUT_POSITIONS = [4, 5, 6, 7, 8, 9];

function randomCalloutPosition(): number {
  return CALLOUT_POSITIONS[Math.floor(Math.random() * CALLOUT_POSITIONS.length)];
}

export function generateAss(
  words: Word[],
  callouts: Callout[],
  wordsPerChunk = 5,
  videoWidth = 1280,
  videoHeight = 720
): string {
  const captionFontSize = Math.round(videoHeight * 0.055);
  const calloutFontSize = Math.round(videoHeight * 0.05);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,${captionFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,40,40,50,1
Style: Callout,Arial,${calloutFontSize},&H00000000,&H000000FF,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,1,0,3,5,0,8,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];

  // Captions: 5-word chunks, bottom-center, subtle fade
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const slice = words.slice(i, i + wordsPerChunk);
    if (slice.length === 0) continue;

    const text = escapeAssText(slice.map((w) => w.word).join(" "));
    const start = toAssTime(slice[0].start);
    const end = toAssTime(slice[slice.length - 1].end);

    lines.push(
      `Dialogue: 0,${start},${end},Caption,,0,0,0,,{\\fad(120,120)}${text}`
    );
  }

  // Sort callouts by start time and trim overlaps so only one shows at a time
  const sorted = [...callouts].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].end > sorted[i + 1].start) {
      sorted[i] = { ...sorted[i], end: sorted[i + 1].start };
    }
  }

  // Callouts: ALL CAPS black text on white box, random position, pop-in scale animation
  for (const callout of sorted) {
    const text = escapeAssText(callout.text.toUpperCase());
    const start = toAssTime(callout.start);
    const end = toAssTime(callout.end);
    const pos = randomCalloutPosition();

    // \an positions it, \fad fades in/out, \t + \fscx\fscy animates a scale "pop" from 60% to 100% over 200ms
    lines.push(
      `Dialogue: 1,${start},${end},Callout,,0,0,0,,{\\an${pos}\\fad(150,200)\\fscx60\\fscy60\\t(0,200,\\fscx100\\fscy100)}${text}`
    );
  }

  return header + lines.join("\n") + "\n";
}