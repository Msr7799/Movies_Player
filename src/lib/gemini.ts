function configuredGeminiModels() {
  const configured = `${process.env.GEMINI_MODELS_LITE ?? ""} ${process.env.GEMINI_PREFLIGHT_MODELS ?? ""}`
    .match(/gemini-[a-z0-9._-]+/gi) ?? [];
  return [...new Set([...configured, "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash-lite"])];
}

export async function geminiJson<T>(prompt: string, responseSchema: object, timeoutMs = 30_000): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  for (const model of configuredGeminiModels()) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
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
