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
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `Split this video narration script into visual "beats" - segments that each work as one on-screen shot, roughly 5-10 seconds of speech each (merge very short sentences, split very long ones at natural pauses).

For each beat provide:
- "text": the exact text of that beat, verbatim from the script (do not paraphrase - I need to match it back to word timestamps)
- "keywords": 3-5 concrete VISUAL stock-search terms (things a camera can film - objects, scenes, actions - not abstract concepts). Example: for "your electric bill is climbing" use ["electric bill paper", "utility meter spinning", "worried person bills"] not ["expense", "concern"]
- "treatment": either "video" (motion suits this beat) or "image" (a still photo suits it better - e.g. historical references, diagrams, static objects)

Respond ONLY with a valid JSON array, no other text:
[{ "text": "...", "keywords": ["...", "..."], "treatment": "video" }]

Script:
${script}`,
        },
      ],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const aiBeats: { text: string; keywords: string[]; treatment: "video" | "image" }[] =
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