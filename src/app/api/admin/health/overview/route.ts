import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { parseHealthWindow, parseOptionalUserId } from "@/lib/admin/healthParams";
import { getHealthOverview } from "@/lib/admin/healthData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const params = new URL(request.url).searchParams;
    const window = parseHealthWindow(params);
    const userId = parseOptionalUserId(params);
    if (!window || userId === undefined) return NextResponse.json({ code: "invalid_period" }, { status: 400 });
    try { return NextResponse.json(await getHealthOverview(window, Date.now(), userId)); }
    catch { return NextResponse.json({ code: "health_unavailable" }, { status: 503 }); }
}
