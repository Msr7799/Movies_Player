import { geminiImageJson } from "@/lib/gemini";

export const runtime = "nodejs";

type Identification = {
  identified: boolean;
  display_title: string;
  year: string;
  confidence: number;
  evidence: string;
};

const schema = {
  type: "object",
  properties: {
    identified: { type: "boolean" },
    display_title: { type: "string" },
    year: { type: "string" },
    confidence: { type: "number" },
    evidence: { type: "string" },
  },
  required: ["identified", "display_title", "year", "confidence", "evidence"],
};

const buckets = new Map<string, number[]>();

function rateLimited(request: Request) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((time) => now - time < 10 * 60_000);
  if (recent.length >= 8) return true;
  buckets.set(key, [...recent, now]);
  return false;
}

export async function POST(request: Request) {
  if (rateLimited(request)) return Response.json({ error: "محاولات تعريف كثيرة." }, { status: 429 });
  try {
    const body = await request.json() as { poster?: unknown; sourceUrl?: unknown; currentTitle?: unknown; capturedAt?: unknown };
    const poster = typeof body.poster === "string" ? body.poster : "";
    if (poster.length < 100 || poster.length > 150_000) return Response.json({ error: "صورة غير صالحة." }, { status: 400 });
    const source = typeof body.sourceUrl === "string" ? new URL(body.sourceUrl) : null;
    if (!source || !["http:", "https:"].includes(source.protocol)) return Response.json({ error: "رابط غير صالح." }, { status: 400 });
    const safeSource = `${source.hostname}${decodeURIComponent(source.pathname).slice(-240)}`;
    const currentTitle = typeof body.currentTitle === "string" ? body.currentTitle.slice(0, 180) : "";
    const capturedAt = typeof body.capturedAt === "number" ? Math.max(0, Math.round(body.capturedAt)) : 0;

    const result = await geminiImageJson<Identification>(`Identify the underlying movie or long-form video conservatively from this single playback frame.
The frame may be a preroll advertisement, betting ad, TV channel promo, logo, intro, news insert, or unrelated overlay. Never identify the underlying movie from an advertisement or watermark alone. If the frame lacks strong title, cast, scene, or readable-program evidence, set identified=false and confidence below 0.7.
Use the sanitized source path only as weak supporting evidence; generic filenames such as master, index, playlist, chunk, video, or manifest contain no title evidence.
Return a concise display_title suitable for an Arabic media library. Preserve the original internationally recognized title when Arabic is uncertain, and append the release year only when supported. Do not invent a title.
Current fallback title: ${JSON.stringify(currentTitle)}
Sanitized source host/path: ${JSON.stringify(safeSource)}
Frame captured around second: ${capturedAt}`, schema, poster);

    const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
    const displayTitle = result.display_title.trim().slice(0, 180);
    const generic = /^(master|index|playlist|manifest|video|stream)$/i.test(displayTitle);
    return Response.json({
      identified: result.identified === true && confidence >= .82 && displayTitle.length >= 2 && !generic,
      title: displayTitle,
      year: result.year.trim().slice(0, 8),
      confidence,
      evidence: result.evidence.trim().slice(0, 240),
    });
  } catch {
    return Response.json({ identified: false, title: "", year: "", confidence: 0, evidence: "" });
  }
}
