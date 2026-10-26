import { describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../api/router.js";

const paths = [
  "/api",
  "/api/openapi",
  "/api/discover",
  "/api/suggest",
  "/api/admin/catalog",
  "/api/admin/login",
  "/api/admin/logout",
  "/api/admin/session",
  "/api/admin/settings",
  "/api/v1/catalog",
  "/api/v1/catalog/from-tmdb",
  "/api/v1/health",
  "/api/v1/media",
  "/api/v1/movie-metadata",
  "/api/v1/providers",
  "/api/v1/search",
  "/api/v1/suggestions",
  "/api/v1/tmdb/details",
  "/api/v1/tmdb/search",
];

function dispatch(path: string) {
  const request = {
    method: "OPTIONS",
    headers: {},
    query: { __api_path: path === "/api" ? "__root" : path.slice(5), original: "preserved" },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as VercelRequest;
  let status = 200;
  const response = {
    setHeader() { return this; },
    status(value: number) { status = value; return this; },
    json() { return this; },
    end() { return this; },
  } as unknown as VercelResponse;
  return Promise.resolve(handler(request, response)).then(() => ({ status, query: request.query }));
}

describe("single Vercel API router", () => {
  it.each(paths)("preserves %s", async (path) => {
    const result = await dispatch(path);
    expect(result.status).toBe(["/api/admin/login", "/api/admin/logout"].includes(path) ? 405 : 204);
    expect(result.query).toEqual({ original: "preserved" });
  });

  it("returns 404 for unknown paths", async () => {
    expect((await dispatch("/api/v1/missing")).status).toBe(404);
  });
});
