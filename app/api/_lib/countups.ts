type Word = { word: string; start: number; end: number };

export type CountupSpec = {
  phrase: string;
  value: number;
  prefix: string;
  suffix: string;
  decimals: number;
  compact: boolean;
  importance: number;
  animStart: number; // when counting begins (near sentence start)
  land: number;      // when the final value is reached (the spoken moment)
};

export function formatCountupValue(v: number, spec: CountupSpec): string {
  let num: string;
  if (spec.compact) {
    const abs = Math.abs(v);
    if (abs >= 1e9) num = (v / 1e9).toFixed(abs / 1e9 >= 10 ? 0 : 1).replace(/\.0$/, "") + "B";
    else if (abs >= 1e6) num = (v / 1e6).toFixed(abs / 1e6 >= 10 ? 0 : 1).replace(/\.0$/, "") + "M";
    else if (abs >= 1e4) num = (v / 1e3).toFixed(0) + "K";
    else num = Math.round(v).toLocaleString("en-US");
  } else if (spec.decimals > 0) {
    num = v.toFixed(spec.decimals);
  } else {
    num = Math.round(v).toLocaleString("en-US");
  }
  return `${spec.prefix}${num}${spec.suffix}`;
}

// One Claude call: find numbers that pass the category filter AND importance test.
export async function detectCountups(
  script: string,
  words: Word[],
  level: string
): Promise<CountupSpec[]> {
  if (level === "off" || !script || words.length === 0) return [];

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Find numbers in this narration that deserve an animated count-up overlay.

A number qualifies ONLY if it passes BOTH tests:

CATEGORY FILTER - always exclude: calendar years (1995, 2024), dates, times of day, ages (unless story-critical), phone numbers, addresses, ZIP codes, model/version numbers, rankings (unless highly significant), chapter/episode/page/citation numbers, trivial small quantities, and numbers that merely IDENTIFY something rather than MEASURE something.

PRIORITIZE: large financial amounts, major percentages, population figures, casualty figures, people affected, major increases/decreases, job gains/losses, vote totals, business losses/profits/valuations, significant distances/sizes, any statistic central to the sentence's meaning.

IMPORTANCE TEST: score 0-100 based on whether the number is central to the meaning, impact, scale, or emotional weight of its sentence - NOT its numerical size. "Only 3 people survived" scores high; "Room 8000" scores zero. Include only numbers scoring 70+.

If a sentence has multiple qualifying numbers, keep only the most significant one unless they form a meaningful comparison.

For each qualifying number provide:
- "phrase": the number as it appears VERBATIM in the script INCLUDING its unit/scale words (e.g. "8.2%", "25 billion dollars", "500 people") - I match it to word timestamps
- "value": the FULL numeric target with magnitude applied. Be exact: "25 billion dollars" -> 25000000000 (NOT 25 or 25000000). "3.5 million" -> 3500000. "eight hundred thousand" -> 800000. "8.2 percent" -> 8.2. Double-check the zeros.
- "prefix": display prefix or "" - "$" whenever the script says dollars or uses a $ sign
- "suffix": display suffix or "" (e.g. "%", " PEOPLE", " JOBS")
- "decimals": decimal places to show (e.g. 1 for 8.2%)
- "compact": true if it should display compactly (25M, 1.5B), false otherwise
- "importance": your 0-100 score

Respond ONLY with a valid JSON array, no other text. If nothing qualifies, respond [].

Script:
${script}`,
      },
    ],
  });

  const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
  const cleaned = rawText.replace(/```json|```/g, "").trim();

  let items: any[] = [];
  try {
    items = JSON.parse(cleaned);
  } catch {
    return [];
  }

  // Match each phrase to word timestamps with a moving cursor (script order)
  const specs: CountupSpec[] = [];
  let cursor = 0;

  // Deterministic verification: the phrase is verbatim script text, so its own
  // digits + scale words are ground truth. Re-derive the value and override the
  // model's parse whenever they disagree - the script always wins.
  const SCALES: [RegExp, number][] = [
    [/trillion/i, 1e12],
    [/billion|\bbn\b/i, 1e9],
    [/million/i, 1e6],
    [/thousand/i, 1e3],
  ];
  const WORD_NUMS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90, hundred: 100, half: 0.5,
  };
  function deriveFromPhrase(phrase: string): number | null {
    const digitMatch = phrase.match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
    let base: number | null = null;
    if (digitMatch) {
      base = parseFloat(digitMatch[1].replace(/,/g, ""));
    } else {
      // spelled-out simple numbers ("eight billion", "twenty five million")
      const toks = phrase.toLowerCase().split(/[\s-]+/);
      let acc = 0;
      let found = false;
      for (const t of toks) {
        const c = t.replace(/[^a-z]/g, "");
        if (c in WORD_NUMS) {
          found = true;
          acc = WORD_NUMS[c] === 100 && acc > 0 ? acc * 100 : acc + WORD_NUMS[c];
        }
      }
      if (found) base = acc;
    }
    if (base === null || isNaN(base)) return null;
    for (const [re, mult] of SCALES) {
      if (re.test(phrase)) return base * mult;
    }
    return base;
  }

  for (const item of items) {
    if (!item.phrase || typeof item.value !== "number" || (item.importance ?? 0) < 70) continue;

    const derived = deriveFromPhrase(String(item.phrase));
    if (derived !== null && derived > 0) {
      const ratio = item.value > 0 ? derived / item.value : Infinity;
      if (ratio < 0.995 || ratio > 1.005) {
        console.log(
          `DEBUG - countup value corrected: "${item.phrase}" model=${item.value} -> script=${derived}`
        );
        item.value = derived;
        // A magnitude fix usually means compact display is wanted
        if (derived >= 1e4) item.compact = true;
      }
    }
    const pl = String(item.phrase).toLowerCase();
    if ((pl.includes("$") || pl.includes("dollar")) && item.prefix !== "$") item.prefix = "$";
    if ((pl.includes("%") || pl.includes("percent")) && !String(item.suffix || "").includes("%")) item.suffix = "%";

    const phraseTokens = String(item.phrase)
      .toLowerCase()
      .split(/\s+/)
      .map((t: string) => t.replace(/[^a-z0-9.$%]/g, ""))
      .filter(Boolean);
    if (phraseTokens.length === 0) continue;

    const firstTok = phraseTokens[0].replace(/[^a-z0-9]/g, "");

    let matchIdx = -1;
    for (let i = cursor; i < words.length; i++) {
      const clean = words[i].word.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (clean && (clean === firstTok || clean.startsWith(firstTok) || firstTok.startsWith(clean))) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx < 0) continue;

    const endIdx = Math.min(matchIdx + phraseTokens.length - 1, words.length - 1);
    const land = words[endIdx].end;

    // Sentence start: walk back to the previous sentence-ending word
    let sentStart = 0;
    for (let i = matchIdx - 1; i >= 0; i--) {
      if (/[.!?]$/.test(words[i].word.trim())) {
        sentStart = words[i].end;
        break;
      }
    }
    // Count duration: from near sentence start, clamped to 1.2-5s before the land moment
    let animStart = Math.max(sentStart, land - 5);
    if (land - animStart < 1.2) animStart = Math.max(0, land - 1.2);

    specs.push({
      phrase: item.phrase,
      value: item.value,
      prefix: item.prefix || "",
      suffix: item.suffix || "",
      decimals: item.decimals || 0,
      compact: Boolean(item.compact),
      importance: item.importance ?? 70,
      animStart,
      land,
    });

    cursor = endIdx + 1;
  }

  // Frequency enforcement by level: caps + minimum spacing, keeping the most important
  const videoDur = words[words.length - 1].end;
  const caps: Record<string, { max: number; spacing: number }> = {
    low: { max: Math.max(1, Math.floor(videoDur / 150)), spacing: 45 },
    medium: { max: Math.min(5, Math.max(1, Math.floor(videoDur / 90))), spacing: 30 },
    high: { max: Math.min(8, Math.max(2, Math.floor(videoDur / 60))), spacing: 20 },
  };
  const rule = caps[level] || caps.medium;

  const byImportance = [...specs].sort((a, b) => b.importance - a.importance);
  const kept: CountupSpec[] = [];
  for (const s of byImportance) {
    if (kept.length >= rule.max) break;
    if (kept.every((k) => Math.abs(k.land - s.land) >= rule.spacing)) {
      kept.push(s);
    }
  }

  return kept.sort((a, b) => a.land - b.land);
}
