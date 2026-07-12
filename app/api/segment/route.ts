import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Word = { word: string; start: number; end: number };

export async function POST(req: NextRequest) {
  try {
    const { script, words } = (await req.json()) as {
      script: string;
      words: Word[];
    };

    if (!script) {
      return NextResponse.json({ error: "No script provided" }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      messages: [
        {
          role: "user",
          content: `You are an experienced documentary editor and visual researcher planning the complete visual sequence for a narrated video.

First read the ENTIRE script to understand its overall topic and identify every named entity (people, companies, organizations, places, events, products, time periods).

Then split the script into visual "beats" - segments that each work as one on-screen shot, roughly 5-10 seconds of speech each. Group sentences into one beat when they discuss the same subject or idea; start a new beat when the narrative focus changes, a new entity is introduced, or a meaningful action occurs.

CRITICAL - contextual continuity: resolve every pronoun and indirect reference ("he", "she", "the company", "the president", "the city", "the incident") to the correct previously established subject. Search queries must ALWAYS name the resolved subject explicitly - never the pronoun. Example: if a prior sentence establishes General Motors and the current beat says "but by 2008, the company was on the verge of collapse", the queries must be like "General Motors 2008 financial crisis" and "GM factory recession 2008" - NEVER "company verge of collapse" or "sad businessman office".

For each beat provide:
- "text": the exact text of that beat, verbatim from the script (do not paraphrase - I match it back to word timestamps)
- "entities": the resolved subjects this beat is actually about (e.g. ["General Motors", "2008 financial crisis"]); [] if none
- "queries": 3-4 stock/archive search queries in strict priority order:
  1st: the EXACT subject/entity/event/location/moment, fully named
  2nd: the same subject from a different angle, environment, action, or era
  3rd: broader but still accurate framing of the subject
  4th (only if genuinely useful): accurate symbolic B-roll that communicates the idea without misleading the viewer
- "keywords": 2-4 short display terms summarizing the visual direction
- "treatment": "video" (motion suits this beat) or "image" (a still suits it better - historical references, documents, static subjects)
- "map": include ONLY when geographic movement, spread, migration, military campaigns, travel routes, expansion, territorial change, or regional comparison is CENTRAL to understanding the beat - never for incidental location mentions ("she was born in Chicago" gets NO map). Score the geographic importance 0-100; only include the field at all if it scores 75+. Choose the best "template":
  "route" = travel/movement from origin through stops to destination (2-5 locations in travel order)
  "spread" = a phenomenon expanding outward from an origin into surrounding places (origin first, then affected places)
  "sequence" = multiple places named/revealed one by one with no travel between them (2-6 locations in narration order)
  "region" = one country/state/region itself is the subject - also provide "region": "<name>" alongside a representative location
  "reveal" = a single highly significant place (1 location)
Format: { "template": "route", "score": 82, "region": "Ukraine", "locations": [{ "name": "Kyiv", "lat": 50.45, "lon": 30.52 }, ...] } with accurate real-world coordinates ("region" only for the region template).

Respond ONLY with a valid JSON array, no other text:
[{ "text": "...", "entities": ["..."], "queries": ["...", "..."], "keywords": ["..."], "treatment": "video", "map": { "template": "route", "score": 82, "locations": [{ "name": "...", "lat": 0, "lon": 0 }] } }]
(omit "map" entirely on beats where geography is not central)

Script:
${script}`,
        },
      ],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const aiBeats: { text: string; entities: string[]; queries: string[]; keywords: string[]; treatment: "video" | "image"; map?: { template: string; score: number; region?: string; locations: { name: string; lat: number; lon: number }[] } }[] =
      JSON.parse(cleaned);

    // Map beats to narration timings sequentially: beats are verbatim and in
    // order, so walk the word list with a cursor. Snap each beat's start to its
    // first word within a small lookahead window, size it by word count - never
    // depends on last-word matching, so every beat gets a timestamp.
    let wordCursor = 0;
    const beats = aiBeats.map((beat) => {
      const beatWords = beat.text
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^a-z0-9']/g, ""))
        .filter(Boolean);

      let start = 0;
      let end = 0;

      if (words && words.length > 0 && beatWords.length > 0 && wordCursor < words.length) {
        const firstWord = beatWords[0];
        let startIdx = wordCursor;
        const windowEnd = Math.min(wordCursor + 12, words.length);
        for (let i = wordCursor; i < windowEnd; i++) {
          const clean = words[i].word.toLowerCase().replace(/[^a-z0-9']/g, "");
          if (clean === firstWord) {
            startIdx = i;
            break;
          }
        }

        const endIdx = Math.min(startIdx + beatWords.length - 1, words.length - 1);
        start = words[startIdx].start;
        end = words[endIdx].end;
        wordCursor = endIdx + 1;
      }

      const duration =
        end > start
          ? end - start
          : Math.max(2, beat.text.trim().split(/\s+/).length / 2.5);

      return { ...beat, start, end, duration };
    });

    console.log(
      `DEBUG - beats with real timings: ${beats.filter((b) => b.end > b.start).length}/${beats.length}`
    );

    return NextResponse.json({ beats });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}