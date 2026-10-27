import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import HomeClient from "./HomeClient";
import { translatorTtsQaLoginUrl } from "@/lib/translator/firstSentenceFastTts";

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ ttsMode?: string | string[] }>;
}) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { ttsMode } = await searchParams;
    redirect(translatorTtsQaLoginUrl(typeof ttsMode === "string" ? `?ttsMode=${ttsMode}` : ""));
  }

  return <HomeClient ownerKey={user.id} />;
}
