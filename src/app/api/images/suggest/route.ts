import { NextResponse } from "next/server";

type PexelsPhoto = {
  id: number;
  alt?: string;
  width?: number;
  height?: number;
  src?: {
    small?: string;
    medium?: string;
    large?: string;
    large2x?: string;
    original?: string;
  };
};

type SuggestItem = {
  title: string;
  thumb: string | null;
  importUrl: string | null;
  fullUrl: string | null;
  mime: "image/jpeg";
  pageId: number;
};

const BAD_WORDS = [
  "abstract",
  "background",
  "pattern",
  "texture",
  "wallpaper",
  "illustration",
  "vector",
  "icon",
  "logo",
  "clipart",
  "drawing",
  "render",
  "3d",
  "retro",
  "vintage",
  "old",
  "crt",
  "tube tv",
  "mockup",
  "template",
];

const STOPWORDS_DE = new Set([
  "der", "die", "das",
  "ein", "eine", "einen", "einem", "einer",
  "mein", "meine", "meinen", "meinem", "meiner",
  "dein", "deine", "deinen", "deinem", "deiner",
  "sein", "seine", "seinen", "seinem", "seiner",
  "ihr", "ihre", "ihren", "ihrem", "ihrer",
  "unser", "unsere", "unseren", "unserem", "unserer",
  "euer", "eure", "euren", "eurem", "eurer",
]);

// Universelle Templates für Adjektive / Eigenschaften
const ADJECTIVE_TEMPLATES_EN = [
  "{adj} feather",
  "{adj} stone",
  "{adj} book",
  "{adj} rope",
  "{adj} soup",
  "{adj} fabric",
  "{adj} glass",
  "{adj} paper",
];

function normalize(s: string) {
  return (s ?? "").trim();
}

function normalizeGermanCore(term: string): string {
  let t = normalize(term).toLowerCase();
  t = t.replace(/[.,!?;:()[\]{}"“”„'’]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "";

  const parts = t.split(" ").filter(Boolean);
  while (parts.length && STOPWORDS_DE.has(parts[0])) {
    parts.shift();
  }
  return parts.join(" ").trim();
}

function isLikelyAdjectiveDe(term: string): boolean {
  const t = normalizeGermanCore(term);
  if (!t) return false;
  if (t.includes(" ")) return false;

  const common = new Set([
    "leicht", "schwer", "dick", "dünn", "schnell", "langsam",
    "laut", "leise", "heiß", "kalt", "groß", "klein",
    "neu", "alt", "sauber", "schmutzig", "stark", "schwach",
  ]);
  if (common.has(t)) return true;

  return /(ig|lich|isch|bar|sam|los|voll|end)$/.test(t);
}

type WikidataResolved = { enLabel: string | null; enDesc: string | null };

async function wikidataResolve(term: string, language: "de" | "sw"): Promise<WikidataResolved> {
  const q = normalize(term);
  if (!q) return { enLabel: null, enDesc: null };

  const searchUrl =
    "https://www.wikidata.org/w/api.php" +
    `?action=wbsearchentities&format=json&language=${language}&uselang=${language}` +
    `&search=${encodeURIComponent(q)}&limit=1`;

  const searchRes = await fetch(searchUrl, { cache: "no-store" });
  if (!searchRes.ok) return { enLabel: null, enDesc: null };

  const searchJson: any = await searchRes.json();
  const hit = searchJson?.search?.[0];
  const id = hit?.id as string | undefined;
  if (!id) return { enLabel: null, enDesc: null };

  const entityUrl =
    "https://www.wikidata.org/w/api.php" +
    `?action=wbgetentities&format=json&ids=${encodeURIComponent(id)}` +
    `&props=labels|descriptions&languages=en`;

  const entityRes = await fetch(entityUrl, { cache: "no-store" });
  if (!entityRes.ok) return { enLabel: null, enDesc: null };

  const entityJson: any = await entityRes.json();
  const enLabel = entityJson?.entities?.[id]?.labels?.en?.value;
  const enDesc = entityJson?.entities?.[id]?.descriptions?.en?.value;

  return {
    enLabel: typeof enLabel === "string" ? enLabel.trim() : null,
    enDesc: typeof enDesc === "string" ? enDesc.trim() : null,
  };
}

function deriveHint(enDesc: string | null): "animal" | "food" | "vehicle" | "plant" | "city" | null {
  const d = (enDesc ?? "").toLowerCase();

  if (d.includes("species") || d.includes("animal") || d.includes("mammal") || d.includes("bird")) return "animal";
  if (d.includes("food") || d.includes("ingredient") || d.includes("dish") || d.includes("flour")) return "food";
  if (d.includes("vehicle") || d.includes("car") || d.includes("truck") || d.includes("bus")) return "vehicle";
  if (d.includes("plant") || d.includes("tree") || d.includes("flower")) return "plant";
  if (d.includes("city") || d.includes("town") || d.includes("capital")) return "city";

  return null;
}

function buildQueries(args: {
  germanCore: string;
  swahili: string;
  q: string;
  enLabel: string | null;
  hint: ReturnType<typeof deriveHint>;
}): string[] {
  const { germanCore, swahili, q, enLabel, hint } = args;

  const queries: string[] = [];
  const seen = new Set<string>();
  const push = (val: string) => {
    const v = normalize(val);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) return;
    seen.add(key);
    queries.push(v);
  };

  // 1) EN Label zuerst (Pexels liebt Englisch)
  if (enLabel) {
    push(enLabel);

    if (hint === "animal") {
      push(`${enLabel} animal`);
      push(`${enLabel} farm animal`);
      push(`${enLabel} wildlife`);
    }
    if (hint === "food") {
      push(`${enLabel} ingredient`);
      push(`${enLabel} baking`);
      push(`${enLabel} cooking`);
    }
    if (hint === "vehicle") {
      push(`${enLabel} vehicle`);
    }
    if (hint === "plant") {
      push(`${enLabel} plant`);
    }
    if (hint === "city") {
      push(`${enLabel} city`);
    }

    push(`${enLabel} photo`);
  }

  // 2) Deutsch fallback (ohne Artikel)
  if (germanCore) {
    push(germanCore);
    push(`${germanCore} foto`);
  }

  // 3) Swahili fallback (manchmal gut für Tiere/Orte)
  if (swahili) push(swahili);

  // 4) Adjektiv-Fallback (Eigenschaft → “Szenen”)
  if (germanCore && isLikelyAdjectiveDe(germanCore)) {
    const adj = enLabel ?? germanCore;
    for (const tpl of ADJECTIVE_TEMPLATES_EN) {
      push(tpl.replace("{adj}", adj));
    }
  }

  // 5) final fallback
  if (!germanCore && !swahili && q) push(q);

  // nicht zu viele (sonst langsam / noisy)
  return queries.slice(0, 8);
}

function extractWords(queries: string[]) {
  const words = new Set<string>();
  for (const q of queries) {
    q.split(/\s+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((x) => {
        const w = x.toLowerCase();
        if (w.length >= 3) words.add(w);
      });
  }
  return Array.from(words);
}

function scorePhoto(photo: PexelsPhoto, queryWords: string[], queryIndex: number): number {
  const alt = (photo?.alt ?? "").toLowerCase();

  let score = Math.max(0, 100 - queryIndex * 12);

  if (BAD_WORDS.some((w) => alt.includes(w))) score -= 50;

  let hits = 0;
  for (const w of queryWords) {
    if (alt.includes(w)) hits += 1;
  }
  score += hits * 10;

  const w = Number(photo.width ?? 0);
  const h = Number(photo.height ?? 0);
  const pixels = w * h;

  if (pixels >= 2_000_000) score += 25;
  else if (pixels >= 1_000_000) score += 15;
  else if (pixels >= 600_000) score += 8;
  else score -= 10;

  return score;
}

async function pexelsSearch(apiKey: string, query: string, perPage: number) {
  const url =
    `https://api.pexels.com/v1/search` +
    `?query=${encodeURIComponent(query)}` +
    `&per_page=${perPage}` +
    `&size=large`;

  const res = await fetch(url, {
    headers: { Authorization: apiKey },
    cache: "no-store",
  });

  if (!res.ok) return { ok: false as const, photos: [] as PexelsPhoto[] };
  const json: any = await res.json();
  return { ok: true as const, photos: (json?.photos ?? []) as PexelsPhoto[] };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const germanRaw = searchParams.get("german") ?? "";
  const swahiliRaw = searchParams.get("swahili") ?? "";
  const q = searchParams.get("q") ?? "";

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PEXELS_API_KEY is not configured." }, { status: 500 });
  }

  const germanCore = normalizeGermanCore(germanRaw || q);
  const swahili = normalize(swahiliRaw);

  if (!germanCore && !normalize(q)) {
    return NextResponse.json({ error: "german or q is required" }, { status: 400 });
  }

  // 1) Wikidata über DE
  let resolved = germanCore ? await wikidataResolve(germanCore, "de") : { enLabel: null, enDesc: null };

  // 2) Fallback: falls DE nix, versuch Swahili als Suchsprache (hilft z.B. bei Tiernamen)
  if ((!resolved.enLabel || resolved.enLabel.length === 0) && swahili) {
    const swRes = await wikidataResolve(swahili, "sw");
    if (swRes.enLabel) resolved = swRes;
  }

  const hint = deriveHint(resolved.enDesc);

  const queries = buildQueries({
    germanCore: germanCore || normalizeGermanCore(q),
    swahili,
    q,
    enLabel: resolved.enLabel,
    hint,
  });

  const queryWords = extractWords(queries);
  const results = new Map<number, { item: SuggestItem; score: number }>();

  // Hauptdurchlauf: mehrere Queries, moderate per_page
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const { ok, photos } = await pexelsSearch(apiKey, query, 30);
    if (!ok) continue;

    for (const photo of photos) {
      const s = scorePhoto(photo, queryWords, i);
      const existing = results.get(photo.id);

      if (!existing || s > existing.score) {
        results.set(photo.id, {
          score: s,
          item: {
            title: photo.alt ?? "",
            thumb: photo.src?.small ?? null,
            importUrl: photo.src?.large ?? photo.src?.medium ?? null,
            fullUrl: photo.src?.original ?? null,
            mime: "image/jpeg",
            pageId: photo.id,
          },
        });
      }
    }
  }

  let items = Array.from(results.values())
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
    .filter((it) => it.thumb && it.importUrl);

  // 🔥 Fallback: wenn zu wenige Ergebnisse, nochmal breiter mit nur EN-Label
  if (items.length < 6 && resolved.enLabel) {
    const broadQueries: string[] = [];

    // Für food: oft funktionieren “bag of …” / “... ingredient”
    if (hint === "food") {
      broadQueries.push(resolved.enLabel);
      broadQueries.push(`bag of ${resolved.enLabel}`);
      broadQueries.push(`${resolved.enLabel} ingredient`);
      broadQueries.push(`${resolved.enLabel} baking`);
    } else if (hint === "animal") {
      broadQueries.push(resolved.enLabel);
      broadQueries.push(`${resolved.enLabel} animal`);
      broadQueries.push(`${resolved.enLabel} farm`);
      broadQueries.push(`${resolved.enLabel} portrait`);
    } else {
      broadQueries.push(resolved.enLabel);
    }

    for (const bq of broadQueries) {
      const { ok, photos } = await pexelsSearch(apiKey, bq, 60);
      if (!ok) continue;

      for (const photo of photos) {
        const s = scorePhoto(photo, queryWords, 99); // späterer “Lauf”, daher niedriger base
        const existing = results.get(photo.id);
        if (!existing || s > existing.score) {
          results.set(photo.id, {
            score: s,
            item: {
              title: photo.alt ?? "",
              thumb: photo.src?.small ?? null,
              importUrl: photo.src?.large ?? photo.src?.medium ?? null,
              fullUrl: photo.src?.original ?? null,
              mime: "image/jpeg",
              pageId: photo.id,
            },
          });
        }
      }
    }

    items = Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item)
      .filter((it) => it.thumb && it.importUrl);
  }

  // UI-Limit
  items = items.slice(0, 16);

  return NextResponse.json({ items });
}
