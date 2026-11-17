import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { parseHealthWindow } from "@/lib/admin/healthParams";
import { getHealthOverview } from "@/lib/admin/healthData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const window = parseHealthWindow(new URL(request.url).searchParams);
    if (!window) return NextResponse.json({ code: "invalid_period" }, { status: 400 });
    try { return NextResponse.json(await getHealthOverview(window)); }
    catch { return NextResponse.json({ code: "health_unavailable" }, { status: 503 }); }
}
