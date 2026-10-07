function configuredGeminiModels() {
  const configured = `${process.env.GEMINI_MODELS_LITE ?? ""} ${process.env.GEMINI_PREFLIGHT_MODELS ?? ""}`
    .match(/gemini-[a-z0-9._-]+/gi) ?? [];
  return [...new Set([...configured, "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash-lite"])];
}

type GeminiApiKeyName = "GEMINI_API_KEY" | "GEMINI_AUTO_SUGGESTED_API_KEY";
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

async function generateGeminiJson<T>(
  parts: GeminiPart[],
  responseSchema: object,
  timeoutMs: number,
  apiKeyName: GeminiApiKeyName,
): Promise<T> {
  const apiKey = process.env[apiKeyName];
  if (!apiKey) throw new Error(`${apiKeyName} is not configured`);

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
      if (!response.ok) continue;
      const payload = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      if (text) return JSON.parse(text) as T;
    } catch {
      // Try the next configured model without exposing credentials or provider details.
    }
  }
  throw new Error("Gemini could not process this request");
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
