import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  console.log("[images/suggest] q=", q);

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  // Wichtig: namespace=6 => File:... Treffer
  // Wichtig: iiurlwidth=320 => liefert thumburl (klein genug -> kein 413 später!)
  const url =
    "https://commons.wikimedia.org/w/api.php" +
    `?action=query&format=json&origin=*` +
    `&generator=search` +
    `&gsrsearch=${encodeURIComponent(q)}` +
    `&gsrnamespace=6` +
    `&gsrlimit=12` +
    `&prop=imageinfo` +
    `&iiprop=url|mime` +
    `&iiurlwidth=320`;

  console.log("[images/suggest] url=", url);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ error: "Wikimedia request failed" }, { status: 502 });
  }

  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  console.log("[images/suggest] pages keys=", Object.keys(pages).length);

  const items = Object.values(pages)
    .map((p: any) => {
      const ii = p?.imageinfo?.[0];
      return {
        title: p?.title ?? "",
        // ✅ klein & schnell (ideal zum Importieren und Anzeigen)
        thumb: ii?.thumburl ?? null,
        // ✅ importUrl = das laden wir in Supabase Storage (kleines Bild!)
        importUrl: ii?.thumburl ?? null,
        // ✅ fullUrl optional (nur Info, später evtl. nützlich)
        fullUrl: ii?.url ?? null,
        mime: ii?.mime ?? null,
        pageId: p?.pageid ?? null,
      };
    })
    .filter((x: any) => x.thumb && x.importUrl);

  console.log("[images/suggest] items=", items.length);

  return NextResponse.json({ items });
}
