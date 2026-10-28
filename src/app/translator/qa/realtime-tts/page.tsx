import { notFound, redirect } from "next/navigation";
import RealtimeTtsQaView from "@/components/translator/qa/RealtimeTtsQaView";
import { supabaseServer } from "@/lib/supabase/server";
import { realtimeTtsQaLoginUrl, realtimeTtsQaPreviewEnabled } from "@/lib/translator/realtimeTtsQa";

export default async function RealtimeTtsQaPage() {
  if (!realtimeTtsQaPreviewEnabled()) notFound();
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(realtimeTtsQaLoginUrl());
  return <RealtimeTtsQaView />;
}
