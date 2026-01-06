import { NextResponse } from "next/server";

type PexelsPhoto = {
  id: number;
  alt?: string;
  src?: {
    small?: string;
    medium?: string;
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

const germanToEnglish: Record<string, string> = {
  fernseher: "television",
  auto: "car",
  hund: "dog",
  katze: "cat",
  haus: "house",
  wasser: "water",
  essen: "food",
  stadt: "city",
  baum: "tree",
  vogel: "bird",
};

function buildQueries(german: string, swahili: string, q: string): string[] {
  const normalizedGerman = german.trim();
  const normalizedSwahili = swahili.trim();
  const fallbackQ = q.trim();
  const queries: string[] = [];
  const seen = new Set<string>();

  const push = (value: string) => {
    const candidate = value.trim();
    const key = candidate.toLowerCase();
    if (!candidate || seen.has(key)) return;
    seen.add(key);
    queries.push(candidate);
  };

  const baseGerman = normalizedGerman || fallbackQ;

  if (baseGerman) {
    push(baseGerman);
    push(`${baseGerman} foto`);

    const englishFallback = germanToEnglish[baseGerman.toLowerCase()];
    if (englishFallback) push(englishFallback);
  }

  if (normalizedSwahili) {
    push(normalizedSwahili);
  }

  if (!baseGerman && !normalizedSwahili && fallbackQ) {
    push(fallbackQ);
  }

  return queries.slice(0, 3);
}

function scorePhoto(
  photo: PexelsPhoto,
  queries: string[],
  german: string,
  englishFallback: string | undefined,
  queryIndex: number,
): number {
  const altLower = (photo?.alt ?? "").toLowerCase();
  const penalties = ["abstract", "background", "pattern", "texture", "wallpaper"];
  let score = Math.max(0, queries.length - queryIndex); // prefer earlier queries

  if (german && altLower.includes(german.toLowerCase())) score += 3;
  if (englishFallback && altLower.includes(englishFallback.toLowerCase())) score += 2;
  if (penalties.some((p) => altLower.includes(p))) score -= 3;

  return score;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const german = searchParams.get("german") ?? "";
  const swahili = searchParams.get("swahili") ?? "";
  const q = searchParams.get("q") ?? "";

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "PEXELS_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const queries = buildQueries(german, swahili, q);

  if (queries.length === 0) {
    return NextResponse.json({ error: "q or german is required" }, { status: 400 });
  }

  const englishFallback = germanToEnglish[(german || q).trim().toLowerCase()];
  const results = new Map<number, { item: SuggestItem; score: number }>();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12`;

    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Pexels request failed for query: ${query}` },
        { status: 502 },
      );
    }

    const json = await res.json();
    const photos: PexelsPhoto[] = json?.photos ?? [];

    for (const photo of photos) {
      const score = scorePhoto(photo, queries, german, englishFallback, i);
      const existing = results.get(photo.id);

      if (!existing || score > existing.score) {
        results.set(photo.id, {
          score,
          item: {
            title: photo.alt ?? "",
            thumb: photo.src?.small ?? null,
            importUrl: photo.src?.medium ?? null,
            fullUrl: photo.src?.original ?? null,
            mime: "image/jpeg",
            pageId: photo.id,
          },
        });
      }
    }
  }

  const items = Array.from(results.values())
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  return NextResponse.json({ items });
}
