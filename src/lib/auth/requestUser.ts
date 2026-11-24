import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

// React cache is request-scoped during a Server Component render. It only
// deduplicates verified Auth lookups for that render and never shares a user
// between requests.
export const getRequestUser = cache(async () => {
    const supabase = await supabaseServer();
    return supabase.auth.getUser();
});
