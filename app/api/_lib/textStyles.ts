// Text & Graphics Style system. Controls ONLY typography and text presentation.
// Never touches image/video selection, media search, or scene selection.

export type TextStyle = {
  id: string;
  captionFont: string;
  captionBold: number;
  captionOutline: number;
  captionSpacing: number;
  captionPrimary: string; // ASS &HAABBGGRR
  captionOutlineColor: string;
  captionFade: [number, number];
  calloutFont: string;
  calloutBold: number;
  calloutBorderStyle: number; // 3 = opaque box, 1 = outline only
  calloutPrimary: string;
  calloutBox: string;
  calloutOutline: number;
  calloutSpacing: number;
  // Animation variants: ASS override tags (without \\an positioning), one picked per callout
  calloutAnimations: string[];
};

export const TEXT_STYLES: Record<string, TextStyle> = {
  standard: {
    id: "standard",
    captionFont: "Arial",
    captionBold: 1,
    captionOutline: 3,
    captionSpacing: 0,
    captionPrimary: "&H00FFFFFF",
    captionOutlineColor: "&H00000000",
    captionFade: [120, 120],
    calloutFont: "Arial",
    calloutBold: 1,
    calloutBorderStyle: 3,
    calloutPrimary: "&H00000000",
    calloutBox: "&H00FFFFFF",
    calloutOutline: 5,
    calloutSpacing: 1,
    calloutAnimations: [
      "\\fad(150,200)\\fscx60\\fscy60\\t(0,200,\\fscx100\\fscy100)",
      "\\fad(250,250)",
    ],
  },
  crime: {
    id: "crime",
    captionFont: "Arial Narrow",
    captionBold: 1,
    captionOutline: 4,
    captionSpacing: 0,
    captionPrimary: "&H00FFFFFF",
    captionOutlineColor: "&H00000000",
    captionFade: [60, 100],
    calloutFont: "Arial Narrow",
    calloutBold: 1,
    calloutBorderStyle: 3,
    calloutPrimary: "&H003C3CE8",
    calloutBox: "&H00101010",
    calloutOutline: 6,
    calloutSpacing: 2,
    calloutAnimations: [
      "\\fad(60,120)\\fscx130\\fscy130\\t(0,120,\\fscx100\\fscy100)",
      "\\fad(50,100)",
      "\\fad(80,150)\\fscx60\\fscy60\\t(0,150,\\fscx100\\fscy100)",
    ],
  },
  history: {
    id: "history",
    captionFont: "Georgia",
    captionBold: 1,
    captionOutline: 2,
    captionSpacing: 0,
    captionPrimary: "&H00F0EBDD",
    captionOutlineColor: "&H00141E28",
    captionFade: [350, 350],
    calloutFont: "Georgia",
    calloutBold: 1,
    calloutBorderStyle: 3,
    calloutPrimary: "&H001E2D3C",
    calloutBox: "&H00C8DFE8",
    calloutOutline: 5,
    calloutSpacing: 1,
    calloutAnimations: [
      "\\fad(400,400)",
      "\\fad(350,350)\\fscx90\\fscy90\\t(0,400,\\fscx100\\fscy100)",
    ],
  },
  modern: {
    id: "modern",
    captionFont: "Helvetica Neue",
    captionBold: 1,
    captionOutline: 3,
    captionSpacing: 0,
    captionPrimary: "&H00FFFFFF",
    captionOutlineColor: "&H00000000",
    captionFade: [100, 100],
    calloutFont: "Helvetica Neue",
    calloutBold: 1,
    calloutBorderStyle: 3,
    calloutPrimary: "&H00FFFFFF",
    calloutBox: "&H00FF7C4F",
    calloutOutline: 6,
    calloutSpacing: 1,
    calloutAnimations: [
      "\\fad(100,150)\\fscx50\\fscy50\\t(0,180,\\fscx100\\fscy100)",
      "\\fad(100,150)\\frz-3\\t(0,200,\\frz0)",
      "\\fad(120,120)\\fscx115\\fscy115\\t(0,150,\\fscx100\\fscy100)",
    ],
  },
  minimalist: {
    id: "minimalist",
    captionFont: "Helvetica Neue",
    captionBold: 0,
    captionOutline: 1,
    captionSpacing: 1,
    captionPrimary: "&H00FFFFFF",
    captionOutlineColor: "&H00000000",
    captionFade: [300, 300],
    calloutFont: "Helvetica Neue",
    calloutBold: 0,
    calloutBorderStyle: 1,
    calloutPrimary: "&H00FFFFFF",
    calloutBox: "&H00000000",
    calloutOutline: 1,
    calloutSpacing: 3,
    calloutAnimations: [
      "\\fad(300,300)",
      "\\fad(250,350)",
    ],
  },
};

export function getTextStyle(id: string | undefined | null): TextStyle {
  return TEXT_STYLES[id || "standard"] || TEXT_STYLES.standard;
}
