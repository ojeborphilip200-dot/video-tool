import sharp from "sharp";

export type VisionCandidate = {
  id: string;
  kind: "video" | "image";
  thumbnail: string;
  source: string;
  description?: string;
};

export type VisionVerdict = { score: number; reason: string };

// Downsize to keep vision calls fast and cheap - archive "thumbnails" are
// sometimes full-resolution scans.
async function fetchThumb(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) video-tool/1.0",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const small = await sharp(buf)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return { data: small.toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

// Scores candidates by LOOKING at them, not by reading their captions. Captions
// are the worst signal in the pipeline: stock libraries keyword-spam, archives
// write catalog-speak. One batched vision call judges what is actually depicted.
export async function visionRank(
  beatText: string,
  entities: string[],
  era: string,
  candidates: VisionCandidate[],
  historyMode = false
): Promise<Map<string, VisionVerdict>> {
  const verdicts = new Map<string, VisionVerdict>();
  if (candidates.length === 0) return verdicts;

  // Cut from 12 to 8: image tokens are the single biggest cost in this
  // pipeline (fires on every beat) - pre-ranking already sorts the best
  // candidates to the front, so the 9th-12th slots were rarely the pick.
  const batch = candidates.slice(0, 8);
  const thumbs = await Promise.all(batch.map((c) => fetchThumb(c.thumbnail)));

  const usable: { cand: VisionCandidate; img: { data: string; mediaType: string } }[] = [];
  batch.forEach((c, i) => {
    const t = thumbs[i];
    if (t) usable.push({ cand: c, img: t });
  });
  if (usable.length === 0) return verdicts;

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const rubricText = `You are a documentary picture editor choosing footage for narration lines. JUDGE WHAT YOU ACTUALLY SEE - ignore what any caption might claim.

Score each 0-100:
- 85-100: genuinely depicts this exact subject/event/period. A viewer would believe it was chosen by a professional researcher.
- 60-84: strongly relevant and usable - right subject matter or period, even if not the exact moment.
- 35-59: loosely related; generic but not wrong.
- 0-34: wrong subject, wrong period, or unusable.

HARD PENALTIES (score below 30):
- Depicts the wrong entity, wrong century, or contradicts the narration
- CGI renders, 3D art, or obvious illustrations when the line calls for reality${historyMode ? " (period paintings, engravings and archival photographs are CORRECT here, not penalized)" : ""}
- Prominent baked-in text, watermarks, logos, or stock-agency overlays
- WRONG ANIMAL: if the narration names or implies a specific species, an image of a different species scores below 25 (a leopard is not a cheetah, a coyote is not a wolf, a crow is not a raven). Wrong habitat (arctic animal on grass) or wrong behavior (a resting animal when the line describes hunting/attacking/running) also scores low. A visibly captive/zoo animal (enclosures, fences, tags, concrete) scores low when the narration implies the wild.
- Collages, screenshots of webpages, book covers, or catalogue plates with borders/labels
- Extreme close-ups of nothing, blank/near-blank frames, or badly damaged scans
- GENERIC STAGED STOCK LOOK: posed actors smiling at the camera, isolated subjects on plain white/gradient backgrounds, obviously staged "corporate stock photo" scenes (fake handshakes, exaggerated team high-fives, models posing as "a doctor" or "a businessman" with no real-world context) - these score below 35 even when the nominal subject matches, because they read as generic rather than documentary-real

COMPOSITION: prefer frames that read clearly at 16:9. A tall portrait scan is fine if the subject is right (we letterbox it) - do not reject it for shape alone.

Respond ONLY with a JSON array, one entry per image, in the order shown:
[{"i": 1, "score": 87, "reason": "six-word reason"}, ...]`;

  const content: any[] = [
    {
      type: "text",
      text: rubricText,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Now judge footage for this narration line:

"${beatText}"

${entities.length > 0 ? `Subjects that must be depicted: ${entities.join(", ")}` : ""}
${era ? `Period: ${era}` : ""}

I am showing you ${usable.length} candidate images (video candidates appear as their poster frame).`,
    },
  ];

  usable.forEach((u, idx) => {
    content.push({ type: "text", text: `Image ${idx + 1} (${u.cand.kind}, ${u.cand.source}):` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: u.img.mediaType, data: u.img.data },
    });
  });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content }],
    });
    const raw = message.content[0].type === "text" ? message.content[0].text : "[]";
    const items = JSON.parse(raw.replace(/```json|```/g, "").trim());

    for (const item of items) {
      const idx = Number(item.i) - 1;
      if (idx >= 0 && idx < usable.length && typeof item.score === "number") {
        verdicts.set(usable[idx].cand.id, {
          score: Math.max(0, Math.min(100, item.score)),
          reason: String(item.reason || ""),
        });
      }
    }
  } catch (e) {
    console.error("Vision ranking failed, falling back to metadata ranking:", e);
  }

  return verdicts;
}
