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
  // Runs on Gemini's free tier (gemini-3.1-flash-lite) instead of a paid Claude
  // call - this is pure extraction with no real reasoning needed, so it doesn't
  // need to touch Anthropic credits at all.
  const apiKey = process.env.GEMINI_API_KEY;
  let rawText = "[]";

  if (apiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Extract every specific place name (city, country, region, landmark) mentioned in this script. Respond ONLY with a JSON array of strings, exact wording as it appears in the text, no other text. If none, respond with [].\n\nScript:\n${script}`,
                  },
                ],
              },
            ],
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
      } else {
        console.error("Gemini location extraction failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("Gemini location extraction error:", err);
    }
  }

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