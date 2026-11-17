import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { parseHealthWindow, parsePage } from "@/lib/admin/healthParams";
import { getEventsPage, getRunsPage, getUserIdentity } from "@/lib/admin/healthData";
import { isUuid } from "@/lib/diagnostics/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const { userId } = await context.params;
    const params = new URL(request.url).searchParams;
    const window = parseHealthWindow(params);
    const eventPage = parsePage(params, "eventPage");
    const runPage = parsePage(params, "runPage");
    if (!isUuid(userId) || !window || !eventPage || !runPage) return NextResponse.json({ code: "invalid_filter" }, { status: 400 });
    try {
        const identity = await getUserIdentity(userId);
        if (!identity) return NextResponse.json({ code: "user_not_found" }, { status: 404 });
        const [events, runs] = await Promise.all([
            getEventsPage(window, eventPage, userId), getRunsPage(window, runPage, userId),
        ]);
        return NextResponse.json({ user: identity, window, events, runs });
    } catch { return NextResponse.json({ code: "health_unavailable" }, { status: 503 }); }
}
