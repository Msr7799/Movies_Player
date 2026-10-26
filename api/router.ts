import type { VercelRequest, VercelResponse } from "@vercel/node";
import apiIndex from "../legacy-api/index.js";
import openapi from "../legacy-api/openapi.js";
import discover from "../legacy-api/discover.js";
import suggest from "../legacy-api/suggest.js";
import adminCatalog from "../legacy-api/admin/catalog.js";
import adminLogin from "../legacy-api/admin/login.js";
import adminLogout from "../legacy-api/admin/logout.js";
import adminSession from "../legacy-api/admin/session.js";
import adminSettings from "../legacy-api/admin/settings.js";
import catalog from "../legacy-api/v1/catalog.js";
import catalogFromTmdb from "../legacy-api/v1/catalog/from-tmdb.js";
import health from "../legacy-api/v1/health.js";
import media from "../legacy-api/v1/media.js";
import movieMetadata from "../legacy-api/v1/movie-metadata.js";
import providers from "../legacy-api/v1/providers.js";
import search from "../legacy-api/v1/search.js";
import suggestions from "../legacy-api/v1/suggestions.js";
import tmdbDetails from "../legacy-api/v1/tmdb/details.js";
import tmdbSearch from "../legacy-api/v1/tmdb/search.js";

type RouteHandler = (request: VercelRequest, response: VercelResponse) => unknown;

const routes: Record<string, RouteHandler> = {
  "/api": apiIndex,
  "/api/openapi": openapi,
  "/api/discover": discover,
  "/api/suggest": suggest,
  "/api/admin/catalog": adminCatalog,
  "/api/admin/login": adminLogin,
  "/api/admin/logout": adminLogout,
  "/api/admin/session": adminSession,
  "/api/admin/settings": adminSettings,
  "/api/v1/catalog": catalog,
  "/api/v1/catalog/from-tmdb": catalogFromTmdb,
  "/api/v1/health": health,
  "/api/v1/media": media,
  "/api/v1/movie-metadata": movieMetadata,
  "/api/v1/providers": providers,
  "/api/v1/search": search,
  "/api/v1/suggestions": suggestions,
  "/api/v1/tmdb/details": tmdbDetails,
  "/api/v1/tmdb/search": tmdbSearch,
};

export default function handler(request: VercelRequest, response: VercelResponse) {
  const matched = request.query.__api_path;
  const path = Array.isArray(matched) ? matched.join("/") : matched;
  const pathname = path === "__root" ? "/api" : typeof path === "string" ? `/api/${path}` : "";
  const route = routes[pathname];
  if (!route) return response.status(404).json({ error: "not_found" });
  delete request.query.__api_path;
  return route(request, response);
}
