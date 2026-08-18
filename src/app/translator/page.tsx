import { redirect } from "next/navigation";
import TranslatorView from "@/components/translator/TranslatorView";
import { supabaseServer } from "@/lib/supabase/server";

export default async function TranslatorPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <TranslatorView />;
}
