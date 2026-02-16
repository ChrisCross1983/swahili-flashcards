import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";

const BUCKET = "card-images";

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await req.json();
  const ownerKey = user.id;
  const { imageUrl } = body as { imageUrl: string };

  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  const imgRes = await fetch(imageUrl);
  const maxBytes = 2_000_000;
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

  return NextResponse.json({ path: filename });
}
