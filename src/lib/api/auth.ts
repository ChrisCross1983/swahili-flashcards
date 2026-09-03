import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import type { TranslatorAuthFailureType } from "@/lib/translator/reliability";

type RequireUserResult =
    | { user: User; response: null; authFailureType: null }
    | { user: null; response: NextResponse; authFailureType: TranslatorAuthFailureType };

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
        const status = error && "status" in error && typeof error.status === "number"
            ? error.status
            : null;
        const message = error?.message?.toLowerCase() ?? "";
        const authFailureType: TranslatorAuthFailureType = !error && !data.user
            ? "missing_session"
            : status === 401 || status === 403 || /invalid|expired|session/.test(message)
                ? "invalid_session"
                : /fetch|network|connect|timeout/.test(message)
                    ? "auth_network_error"
                    : status !== null && status >= 500
                        ? "auth_upstream_error"
                        : "unknown_auth_error";
        return {
            user: null,
            authFailureType,
            response: NextResponse.json(
                { error: "Unauthorized", code: "auth_required", authFailureType },
                { status: 401 },
            ),
        };
    }

    return { user: data.user, response: null, authFailureType: null };
}
