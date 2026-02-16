import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ path: filePath });
}
