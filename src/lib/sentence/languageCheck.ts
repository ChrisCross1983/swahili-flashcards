import { createHash } from "node:crypto";
import { detectLiveLanguageOnServer } from "@/lib/translator/live/server/languageDetector";

export type SentenceLanguageCheck = { status: "ok" } | { status: "input_issue"; reason: "likely_swapped" | "language_mismatch" };

// A single ambiguous word gives too little evidence for a safe blocking decision.
function hasSentenceEvidence(text: string): boolean {
  return (text.match(/\p{L}+/gu) ?? []).length >= 2;
}

export async function checkSentenceLanguages(german: string, swahili: string): Promise<SentenceLanguageCheck> {
  if (!hasSentenceEvidence(german) || !hasSentenceEvidence(swahili)) return { status: "ok" };
  const [germanLanguage, swahiliLanguage] = await Promise.all([
    detectLiveLanguageOnServer(german),
    detectLiveLanguageOnServer(swahili),
  ]);
  if (germanLanguage === "sw" && swahiliLanguage === "de") return { status: "input_issue", reason: "likely_swapped" };
  if ((germanLanguage === "de" && swahiliLanguage === "de") || (germanLanguage === "sw" && swahiliLanguage === "sw")) {
    return { status: "input_issue", reason: "language_mismatch" };
  }
  return { status: "ok" };
}

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 500;
const MAX_CHECKS_PER_HOUR = 60;
const checks = new Map<string, { expiresAt: number; result: Promise<SentenceLanguageCheck> }>();
const usage = new Map<string, { count: number; resetsAt: number }>();

export class SentenceLanguageRateLimitError extends Error {
  constructor() { super("sentence_language_rate_limited"); }
}

function cacheKey(ownerId: string, german: string, swahili: string): string {
  return createHash("sha256").update(JSON.stringify([ownerId, german.trim(), swahili.trim()])).digest("hex");
}

export function getCachedSentenceLanguageCheck(ownerId: string, german: string, swahili: string): Promise<SentenceLanguageCheck> | null {
  const key = cacheKey(ownerId, german, swahili);
  const entry = checks.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    checks.delete(key);
    return null;
  }
  return entry.result;
}

/** Share a recent confirmation between the UI route and the final card write on the same server instance. */
export function getOrCheckSentenceLanguages(ownerId: string, german: string, swahili: string): Promise<SentenceLanguageCheck> {
  if (!hasSentenceEvidence(german) || !hasSentenceEvidence(swahili)) return Promise.resolve({ status: "ok" });
  const cached = getCachedSentenceLanguageCheck(ownerId, german, swahili);
  if (cached) return cached;
  const now = Date.now();
  const previous = usage.get(ownerId);
  const current = previous && previous.resetsAt > now ? previous : { count: 0, resetsAt: now + 3_600_000 };
  if (current.count >= MAX_CHECKS_PER_HOUR) return Promise.reject(new SentenceLanguageRateLimitError());
  current.count++;
  usage.set(ownerId, current);
  const key = cacheKey(ownerId, german, swahili);
  const result = checkSentenceLanguages(german, swahili).catch((error: unknown) => {
    checks.delete(key);
    throw error;
  });
  if (checks.size >= MAX_CACHE_ENTRIES) checks.delete(checks.keys().next().value!);
  checks.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}
