import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { parseOptionalUserId, parsePage } from "@/lib/admin/healthParams";
import { getRun, getRunEventsPage, getUserEmail } from "@/lib/admin/healthData";
import { isUuid } from "@/lib/diagnostics/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const { runId } = await context.params;
    const params = new URL(request.url).searchParams;
    const page = parsePage(params);
    const userId = parseOptionalUserId(params);
    if (!isUuid(runId) || !page || userId === undefined) return NextResponse.json({ code: "invalid_filter" }, { status: 400 });
    try {
        const run = await getRun(runId);
        if (!run || (userId && run.user_id !== userId)) return NextResponse.json({ code: "run_not_found" }, { status: 404 });
        const [events, email] = await Promise.all([getRunEventsPage(runId, run.user_id, page), getUserEmail(run.user_id)]);
        return NextResponse.json({ run, user: { id: run.user_id, email }, events });
    } catch { return NextResponse.json({ code: "health_unavailable" }, { status: 503 }); }
}
