type Word = { word: string; start: number; end: number };
export type Callout = { text: string; start: number; end: number };

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
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    output_config: { effort: "low" },
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

  // Locations that never get a callout pill - add words here as needed
  const EXCLUDED_LOCATIONS = new Set(["america", "moon"]);

  const uniqueLocations = [...new Set(locationNames.map((l) => l.toLowerCase()))].filter(
    (l) => !EXCLUDED_LOCATIONS.has(l.replace(/^the\s+/, "").trim())
  );

  const clean = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");

  for (const location of uniqueLocations) {
    const locationWords = location.toLowerCase().split(/\s+/).map(clean).filter(Boolean);
    if (locationWords.length === 0) continue;

    // Require the FULL consecutive phrase to match - a phrase starting with
    // "the" must never land on some unrelated "the" earlier in the script
    for (let i = 0; i <= words.length - locationWords.length; i++) {
      let matched = true;
      for (let j = 0; j < locationWords.length; j++) {
        if (clean(words[i + j].word) !== locationWords[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const start = words[i].start;
        const end = words[i + locationWords.length - 1].end;
        callouts.push({ text: location, start, end: end + 2 });
        break;
      }
    }
  }

  return callouts;
}