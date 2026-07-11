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
  const uniqueLocations = [...new Set(locationNames.map((l) => l.toLowerCase()))];

  for (const location of uniqueLocations) {
    const locationWords = location.toLowerCase().split(/\s+/);
    const firstWord = locationWords[0];

    for (let i = 0; i < words.length; i++) {
      const cleanedWord = words[i].word.toLowerCase().replace(/[^a-z]/g, "");
      if (cleanedWord === firstWord.replace(/[^a-z]/g, "")) {
        const start = words[i].start;
        const endIndex = Math.min(i + locationWords.length - 1, words.length - 1);
        const end = words[endIndex].end;
        callouts.push({ text: location, start, end: end + 2 });
        break;
      }
    }
  }

  return callouts;
}