import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const BUCKET = "card-images";

export async function POST(req: Request) {
  const body = await req.json();
  const { ownerKey, imageUrl } = body as { ownerKey: string; imageUrl: string };

  if (!ownerKey || !imageUrl) {
    return NextResponse.json({ error: "ownerKey and imageUrl are required" }, { status: 400 });
  }

  // Bild herunterladen
  const imgRes = await fetch(imageUrl);
  const maxBytes = 2_000_000; // 2 MB
  const len = Number(imgRes.headers.get("content-length") ?? "0");
  if (len && len > maxBytes) {
    return NextResponse.json(
      { error: "Bild ist zu groß. Bitte ein anderes wählen." },
      { status: 413 }
    );
  }

  if (!imgRes.ok) {
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }

  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const arrayBuffer = await imgRes.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Dateiendung grob aus Content-Type ableiten
  const ext =
    contentType.includes("png") ? "png" :
      contentType.includes("webp") ? "webp" :
        contentType.includes("gif") ? "gif" : "jpg";

  const filename = `${ownerKey}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabaseServer.storage
    .from(BUCKET)
    .upload(filename, bytes, {
      contentType,
      upsert: false,
    });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Upload to storage failed" }, { status: 500 });
  }

  // WICHTIG: wir geben nur den Pfad im Bucket zurück (so wie du es überall nutzt)
  return NextResponse.json({ path: filename });
}
