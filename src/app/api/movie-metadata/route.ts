import { lookupMovieMetadata } from "@/lib/movie-metadata-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const title = new URL(request.url).searchParams.get("title")?.trim() ?? "";
  if (title.length < 2 || title.length > 180) return Response.json({ error: "invalid_title" }, { status: 400 });
  try {
    return Response.json({ metadata: await lookupMovieMetadata(title) }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "metadata_failed" }, { status: 502 });
  }
}
