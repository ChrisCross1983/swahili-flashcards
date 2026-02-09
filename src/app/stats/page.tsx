import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import StatsClient from "./StatsClient";

export default async function StatsPage() {
    const supabase = await supabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return <StatsClient ownerKey={user.id} />;
}
