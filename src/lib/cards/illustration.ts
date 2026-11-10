const UNSUITABLE = new Set([
  "obwohl", "dennoch", "vielleicht", "verantwortung", "grammatik", "partikel",
  "und", "oder", "aber", "weil", "dass", "wenn", "falls", "trotzdem",
  "na", "lakini", "labda", "kwamba", "ikiwa", "hata", "kwa", "ya", "wa",
]);

export function illustrationInput(body: unknown): { german: string; swahili: string } | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (value.type !== "vocab" || typeof value.german !== "string" || typeof value.swahili !== "string") return null;
  const german = value.german.trim();
  const swahili = value.swahili.trim();
  if (!german || !swahili || german.length > 100 || swahili.length > 100) return null;
  if (/https?:\/\/|[\r\n<>]/i.test(german + swahili)) return null;
  if (UNSUITABLE.has(german.toLocaleLowerCase("de")) || UNSUITABLE.has(swahili.toLowerCase())) return null;
  return { german, swahili };
}

export function illustrationPrompt(input: { german: string; swahili: string }): string {
  return `Modern, friendly, premium editorial illustration for a language-learning flashcard. Depict one recognizable central subject with a clear silhouette and simple form. Use a quiet, minimal background and a consistent, lightly illustrative style that is not childish. No letters, words, labels, numbers, captions, logos, watermarks, interface elements, or visual clutter. Depict the concrete meaning of the German word "${input.german}" (Kiswahili: "${input.swahili}"). If the concept cannot be depicted clearly, do not invent unrelated objects.`;
}
