import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Level1SentenceTrainerClient from "./Level1SentenceTrainerClient";

export default async function SentenceLevelOnePage() {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return <Level1SentenceTrainerClient ownerKey={user.id} />;
}