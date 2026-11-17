import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { parseHealthWindow, parseOptionalUserId, parsePage } from "@/lib/admin/healthParams";
import { getEventsPage } from "@/lib/admin/healthData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const params = new URL(request.url).searchParams;
    const window = parseHealthWindow(params);
    const page = parsePage(params);
    const userId = parseOptionalUserId(params);
    if (!window || !page || userId === undefined) return NextResponse.json({ code: "invalid_filter" }, { status: 400 });
    try { return NextResponse.json(await getEventsPage(window, page, userId)); }
    catch { return NextResponse.json({ code: "health_unavailable" }, { status: 503 }); }
}
