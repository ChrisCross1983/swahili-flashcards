export type SentenceExplanation = {
  version: 1;
  naturalTranslation: string;
  breakdown: Array<{ surface: string; meaning: string; explanation: string }>;
  learningTip: string | null;
};

const MARKUP = /<[^>]*>|\*\*|```|^#{1,6}\s|\[.*\]\(.*\)/m;
const META = /^(?:als (?:ki|ai)|hier ist|ich kann|i cannot|as an ai|system:|user:|assistant:)/i;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max || MARKUP.test(text) || META.test(text)) return null;
  return text;
}

export function parseSentenceExplanation(value: unknown): SentenceExplanation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.breakdown) || record.breakdown.length < 1 || record.breakdown.length > 8) return null;
  if (Object.keys(record).some((key) => !["version", "naturalTranslation", "breakdown", "learningTip"].includes(key))) return null;
  const naturalTranslation = cleanText(record.naturalTranslation, 180);
  if (!naturalTranslation) return null;
  const breakdown = record.breakdown.map((entry): SentenceExplanation["breakdown"][number] | null => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["surface", "meaning", "explanation"].includes(key))) return null;
    const surface = cleanText(row.surface, 40);
    const meaning = cleanText(row.meaning, 80);
    const explanation = cleanText(row.explanation, 160);
    return surface && meaning && explanation ? { surface, meaning, explanation } : null;
  });
  if (breakdown.some((entry) => entry === null)) return null;
  const learningTip = record.learningTip === null || record.learningTip === undefined ? null : cleanText(record.learningTip, 180);
  if (record.learningTip != null && !learningTip) return null;
  return { version: 1, naturalTranslation, breakdown: breakdown as SentenceExplanation["breakdown"], learningTip };
}

export function explanationMatchesSentences(value: SentenceExplanation, german: string, swahili: string): boolean {
  void german;
  const normalize = (text: string) => text.toLocaleLowerCase("de").replace(/[^\p{L}\p{N}]+/gu, "");
  const source = normalize(swahili);
  const pieces = value.breakdown.map((entry) => normalize(entry.surface));
  if (pieces.some((piece) => !piece || !source.includes(piece))) return false;
  // Reject an obvious source-language echo; semantic paraphrases of German remain valid.
  return normalize(value.naturalTranslation) !== source;
}

export function validateSentenceInput(body: unknown): { german: string; swahili: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  if (row.type !== "sentence" || typeof row.german !== "string" || typeof row.swahili !== "string") return null;
  const german = row.german.trim();
  const swahili = row.swahili.trim();
  if (!german || !swahili || german.length > 500 || swahili.length > 500) return null;
  if (Object.keys(row).some((key) => !["type", "german", "swahili"].includes(key))) return null;
  return { german, swahili };
}
