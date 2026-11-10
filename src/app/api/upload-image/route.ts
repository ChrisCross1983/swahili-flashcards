import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { IMAGE_MIME_TYPES, imageTooLarge, imageUploadLimit, isStorageOversizeError } from "@/lib/cards/imageUploadPolicy";

async function storageLimit() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!bucket) throw new Error("Storage bucket not configured");
  const { data, error } = await supabaseServer.storage.getBucket(bucket);
  if (error) throw error;
  return imageUploadLimit(data?.file_size_limit, process.env.SUPABASE_STORAGE_MAX_BYTES);
}

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  try {
    return NextResponse.json({ maxBytes: await storageLimit(), allowedTypes: IMAGE_MIME_TYPES }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "image_policy_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const formData = await req.formData();
  const candidate = formData.get("file");
  const file = candidate instanceof File ? candidate : null;

  if (!file) {
    return NextResponse.json({ error: "image_missing" }, { status: 400 });
  }

  if (!IMAGE_MIME_TYPES.includes(file.type as typeof IMAGE_MIME_TYPES[number])) {
    return NextResponse.json({ error: "image_invalid_format" }, { status: 415 });
  }

  try {
    if (imageTooLarge(file.size, await storageLimit())) {
      return NextResponse.json({ error: "image_too_large" }, { status: 413 });
    }
  } catch {
    // Storage still enforces its own limit if bucket metadata is temporarily unavailable.
  }

  const ext = file.name.split(".").pop();
  const fileName = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const filePath = fileName;

  const { error } = await supabaseServer.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET!)
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: isStorageOversizeError(error) ? "image_too_large" : "image_upload_failed" }, { status: isStorageOversizeError(error) ? 413 : 500 });
  }

  return NextResponse.json({ path: filePath });
}
