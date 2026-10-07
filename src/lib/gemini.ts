function configuredGeminiModels() {
  const configured = `${process.env.GEMINI_MODELS_LITE ?? ""} ${process.env.GEMINI_PREFLIGHT_MODELS ?? ""}`
    .match(/gemini-[a-z0-9._-]+/gi) ?? [];
  return [...new Set([...configured, "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash-lite"])];
}

type GeminiApiKeyName = "GEMINI_API_KEY" | "GEMINI_AUTO_SUGGESTED_API_KEY";
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export class GeminiRequestError extends Error {
  constructor(
    message: string,
    public readonly reason: "missing-key" | "quota" | "forbidden" | "model" | "timeout" | "request",
  ) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

async function generateGeminiJson<T>(
  parts: GeminiPart[],
  responseSchema: object,
  timeoutMs: number,
  apiKeyName: GeminiApiKeyName,
): Promise<T> {
  const apiKey = process.env[apiKeyName];
  if (!apiKey) throw new GeminiRequestError(`${apiKeyName} is not configured`, "missing-key");

  let lastFailure: GeminiRequestError | null = null;

  for (const model of configuredGeminiModels()) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as {
          error?: { status?: string; message?: string };
        } | null;
        const status = payload?.error?.status;
        const detail = [model, `HTTP ${response.status}`, status].filter(Boolean).join(" / ");
        const reason = response.status === 429
          ? "quota"
          : response.status === 401 || response.status === 403
            ? "forbidden"
            : response.status === 404
              ? "model"
              : "request";
        lastFailure = new GeminiRequestError(detail, reason);
        continue;
      }
      const payload = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      if (text) return JSON.parse(text) as T;
      lastFailure = new GeminiRequestError(`${model} returned no JSON output`, "request");
    } catch (cause) {
      if (cause instanceof GeminiRequestError) lastFailure = cause;
      else if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
        lastFailure = new GeminiRequestError(`${model} timed out`, "timeout");
      } else {
        lastFailure = new GeminiRequestError(`${model} returned an invalid response`, "request");
      }
    }
  }
  throw lastFailure ?? new GeminiRequestError("Gemini could not process this request", "request");
}

export async function geminiJson<T>(
  prompt: string,
  responseSchema: object,
  timeoutMs = 30_000,
  apiKeyName: GeminiApiKeyName = "GEMINI_API_KEY",
): Promise<T> {
  return generateGeminiJson<T>([{ text: prompt }], responseSchema, timeoutMs, apiKeyName);
}

export async function geminiImageJson<T>(prompt: string, responseSchema: object, imageDataUrl: string, timeoutMs = 35_000) {
  const match = imageDataUrl.match(/^data:(image\/(?:webp|jpeg|png));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("Unsupported image data");
  return generateGeminiJson<T>([
    { text: prompt },
    { inlineData: { mimeType: match[1], data: match[2] } },
  ], responseSchema, timeoutMs, "GEMINI_API_KEY");
}
