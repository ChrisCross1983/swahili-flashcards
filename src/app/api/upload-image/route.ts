import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { IMAGE_MIME_TYPES, imageTooLarge, imageUploadLimit, isStorageOversizeError } from "@/lib/cards/imageUploadPolicy";

async function storageLimit() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!bucket) throw new Error("Storage bucket not configured");
  const { data, error } = await supabaseServer.storage.getBucket(bucket);
  if (error) throw error;
  if (!data) throw new Error("bucket_lookup_empty");
  return imageUploadLimit(data?.file_size_limit, process.env.SUPABASE_STORAGE_MAX_BYTES);
}

function logStorageFailure(stage: "policy" | "upload", error: unknown) {
  const detail = error as { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown; originalError?: unknown } | null;
  const knownCodes = new Set(["BucketNotFound", "NoSuchBucket", "AccessDenied", "Unauthorized", "InvalidJWT", "InvalidKey", "InvalidObjectName", "EntityTooLarge", "PayloadTooLarge", "InternalError"]);
  const rawCode = typeof detail?.code === "string" ? detail.code : detail?.statusCode;
  const code = typeof rawCode === "string" && knownCodes.has(rawCode) ? rawCode : undefined;
  const rawStatus = detail?.status ?? detail?.statusCode;
  const httpStatus = typeof rawStatus === "string" || typeof rawStatus === "number"
    ? /^[1-5][0-9]{2}$/.test(String(rawStatus)) ? Number(rawStatus) : undefined : undefined;
  const message = typeof detail?.message === "string" ? detail.message : "";
  const reason = !process.env.SUPABASE_STORAGE_BUCKET ? "missing_bucket_config"
    : code === "BucketNotFound" || code === "NoSuchBucket" || httpStatus === 404 ? "bucket_not_found"
      : httpStatus === 401 || code === "Unauthorized" || code === "InvalidJWT" ? "storage_auth_rejected"
        : httpStatus === 403 || code === "AccessDenied" ? "storage_permission_denied"
          : code === "InvalidKey" || code === "InvalidObjectName" ? "invalid_upload_path"
            : detail instanceof TypeError || detail?.originalError instanceof TypeError || /fetch failed|network error|econnrefused|enotfound|timeout/i.test(message)
              ? stage === "policy" ? "bucket_unreachable" : "upload_transport_failed"
              : stage === "policy" ? "bucket_lookup_failed" : httpStatus && httpStatus >= 500 ? "upload_failed" : "storage_other";
  console.error("[upload-image] storage unavailable", {
    stage, reason, code, httpStatus,
  });
}

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  try {
    return NextResponse.json({ maxBytes: await storageLimit(), allowedTypes: IMAGE_MIME_TYPES }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logStorageFailure("policy", error);
    return NextResponse.json({ error: "image_policy_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const { user, response, authFailureType } = await requireUser();
  if (response) {
    console.warn("[upload-image] request rejected", { reason: "auth_required", authFailureType });
    return response;
  }

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
  } catch (error) {
    logStorageFailure("policy", error);
    return NextResponse.json({ error: "image_policy_unavailable" }, { status: 503 });
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const fileName = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const filePath = fileName;

  let error: unknown;
  try {
    ({ error } = await supabaseServer.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET!)
      .upload(filePath, file, { contentType: file.type, upsert: false }));
  } catch (cause) {
    logStorageFailure("upload", cause);
    return NextResponse.json({ error: "image_upload_failed" }, { status: 503 });
  }

  if (error) {
    const storageError = error as { message?: string; statusCode?: string | number; error?: string };
    if (!isStorageOversizeError(storageError)) logStorageFailure("upload", error);
    return NextResponse.json({ error: isStorageOversizeError(storageError) ? "image_too_large" : "image_upload_failed" }, { status: isStorageOversizeError(storageError) ? 413 : 500 });
  }

  return NextResponse.json({ path: filePath });
}
