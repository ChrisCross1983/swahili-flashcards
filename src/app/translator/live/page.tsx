import { redirect } from "next/navigation";
import LiveTranslatorView from "@/components/translator/live/LiveTranslatorView";
import { supabaseServer } from "@/lib/supabase/server";

export default async function LiveTranslatorPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return <LiveTranslatorView />;
}

