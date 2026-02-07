import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SentenceTrainerClient from "./SentenceTrainerClient";

export default async function SentenceTrainerPage() {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return <SentenceTrainerClient ownerKey={user.id} />;
}
