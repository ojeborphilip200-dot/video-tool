import { getTextStyle } from "./textStyles";

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

const CALLOUT_POSITIONS = [4, 5, 6, 7, 8, 9];

function randomCalloutPosition(): number {
  return CALLOUT_POSITIONS[Math.floor(Math.random() * CALLOUT_POSITIONS.length)];
}

export function generateAss(
  words: Word[],
  callouts: Callout[],
  wordsPerChunk = 5,
  videoWidth = 1280,
  videoHeight = 720,
  styleId = "standard"
): string {
  const st = getTextStyle(styleId);
  const captionFontSize = Math.round(videoHeight * 0.055);
  const calloutFontSize = Math.round(videoHeight * 0.05);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${st.captionFont},${captionFontSize},${st.captionPrimary},&H000000FF,${st.captionOutlineColor},&H80000000,${st.captionBold},0,0,0,100,100,${st.captionSpacing},0,1,${st.captionOutline},1,2,40,40,50,1
Style: Callout,${st.calloutFont},${calloutFontSize},${st.calloutPrimary},&H000000FF,${st.calloutBox},${st.calloutBox},${st.calloutBold},0,0,0,100,100,${st.calloutSpacing},0,${st.calloutBorderStyle},${st.calloutOutline},0,8,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const slice = words.slice(i, i + wordsPerChunk);
    if (slice.length === 0) continue;

    const text = escapeAssText(slice.map((w) => w.word).join(" "));
    const start = toAssTime(slice[0].start);
    const end = toAssTime(slice[slice.length - 1].end);

    lines.push(
      `Dialogue: 0,${start},${end},Caption,,0,0,0,,{\\fad(${st.captionFade[0]},${st.captionFade[1]})}${text}`
    );
  }

  const sorted = [...callouts].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].end > sorted[i + 1].start) {
      sorted[i] = { ...sorted[i], end: sorted[i + 1].start };
    }
  }

  for (const callout of sorted) {
    const text = escapeAssText(callout.text.toUpperCase());
    const start = toAssTime(callout.start);
    const end = toAssTime(callout.end);
    const pos = randomCalloutPosition();
    const anim = st.calloutAnimations[Math.floor(Math.random() * st.calloutAnimations.length)];

    lines.push(
      `Dialogue: 1,${start},${end},Callout,,0,0,0,,{\\an${pos}${anim}}${text}`
    );
  }

  return header + lines.join("\n") + "\n";
}
