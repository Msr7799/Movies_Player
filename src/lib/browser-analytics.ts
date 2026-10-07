const VISITOR_KEY = "any-movie-visitor-id";

export function visitorId() {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(VISITOR_KEY, created);
  return created;
}

export function trackAnalytics(event: "visit" | "search" | "play", details: Record<string, unknown> = {}) {
  const id = visitorId();
  if (!id) return;
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, visitorId: id, ...details }),
    keepalive: true,
  }).catch(() => undefined);
}
