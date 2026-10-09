import { redirect } from "next/navigation";
import TranslatorView from "@/components/translator/TranslatorView";
import { translatorTtsQaLoginUrl } from "@/lib/translator/firstSentenceFastTts";
import { supabaseServer } from "@/lib/supabase/server";

export default async function TranslatorPage({
  searchParams,
}: {
  searchParams: Promise<{ ttsMode?: string | string[] }>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const mode = (await searchParams).ttsMode;
    redirect(translatorTtsQaLoginUrl(
      typeof mode === "string" ? `?ttsMode=${encodeURIComponent(mode)}` : "",
    ));
  }

  return <TranslatorView initialFeedbackOwnerId={user.id} />;
}
