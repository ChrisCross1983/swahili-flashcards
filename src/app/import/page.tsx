import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
    const supabase = await supabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return <ImportClient />;
}
