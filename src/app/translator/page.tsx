import { redirect } from "next/navigation";
import TranslatorView from "@/components/translator/TranslatorView";
import { supabaseServer } from "@/lib/supabase/server";
import { translatorTtsQaLoginUrl } from "@/lib/translator/firstSentenceFastTts";

export default async function TranslatorPage({ searchParams }: {
  searchParams: Promise<{ ttsMode?: string | string[] }>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { ttsMode } = await searchParams;
    redirect(translatorTtsQaLoginUrl(typeof ttsMode === "string" ? `?ttsMode=${ttsMode}` : ""));
  }

  return <TranslatorView initialFeedbackOwnerId={user.id} />;
}
