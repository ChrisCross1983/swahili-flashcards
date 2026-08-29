import type { LiveDetectedLanguage } from "./types";

const GERMAN_WORDS = new Set([
  "aber", "auch", "bitte", "das", "dass", "dein", "der", "die", "ein",
  "eine", "es", "für", "haben", "hallo", "ich", "ist", "kann", "können",
  "lange", "mein", "mit", "nicht", "noch", "oder", "reparatur", "sie",
  "sind", "und", "ungefähr", "von", "wann", "warum", "was", "wie", "wir",
  "wo", "zu",
]);

const SWAHILI_WORDS = new Set([
  "asante", "bado", "gani", "habari", "hapa", "hii", "hiyo", "je", "kwa",
  "lakini", "mimi", "muda", "na", "ndiyo", "nini", "saa", "sana", "sijui",
  "siku", "tafadhali", "takribani", "wewe", "ya", "yako", "yangu", "yeye",
  "za", "ndani", "lini", "wapi", "vipi", "karibu", "pole", "hapana",
  "itachukua", "utachukua", "ukarabati",
]);

function words(text: string) {
  return text
    .toLocaleLowerCase()
    .normalize("NFKC")
    .match(/\p{L}+/gu) ?? [];
}

/** Conservative DE/SW classifier. A tie is deliberately unknown. */
export function detectLiveLanguage(text: string): LiveDetectedLanguage {
  const tokens = words(text);
  if (tokens.length === 0) return "unknown";

  let german = /[äöüß]/i.test(text) ? 3 : 0;
  let swahili = 0;

  for (const token of tokens) {
    if (GERMAN_WORDS.has(token)) german += 2;
    if (SWAHILI_WORDS.has(token)) swahili += 2;
    if (/^(ni|si|na|wa|ki|vi|ku|tu|m|u|i)\p{L}{3,}$/u.test(token)) swahili += 0.25;
    if (/^(ge|be|ver|ent|zer)\p{L}{4,}$/u.test(token)) german += 0.2;
  }

  if (german >= 2 && german >= swahili + 1) return "de";
  if (swahili >= 2 && swahili >= german + 1) return "sw";
  return "unknown";
}

export function targetForSource(source: "de" | "sw") {
  return source === "de" ? ("sw" as const) : ("de" as const);
}

