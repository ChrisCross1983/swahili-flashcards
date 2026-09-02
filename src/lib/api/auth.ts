import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

type RequireUserResult =
    | { user: User; response: null }
    | { user: null; response: NextResponse };

type RequireUserInstrumentation = {
    onClientPreparationStarted?: () => void;
    onClientPreparationCompleted?: () => void;
    onUserLookupStarted?: () => void;
    onUserLookupCompleted?: () => void;
};

export async function requireUser(
    instrumentation: RequireUserInstrumentation = {},
): Promise<RequireUserResult> {
    instrumentation.onClientPreparationStarted?.();
    const supabase = await supabaseServer();
    instrumentation.onClientPreparationCompleted?.();
    instrumentation.onUserLookupStarted?.();
    const { data, error } = await supabase.auth.getUser();
    instrumentation.onUserLookupCompleted?.();

    if (error || !data.user) {
        return {
            user: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    return { user: data.user, response: null };
}
