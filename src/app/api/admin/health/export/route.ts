import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { getHealthExport } from "@/lib/admin/healthData";
import { parseHealthWindow, parseOptionalUserId } from "@/lib/admin/healthParams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const params = new URL(request.url).searchParams;
    const window = parseHealthWindow(params);
    const userId = parseOptionalUserId(params);
    if (!window || userId === undefined) return NextResponse.json({ code: "invalid_filter" }, { status: 400 });
    try {
        const report = await getHealthExport(window, userId);
        return NextResponse.json({
            ...report,
            meta: {
                generated_at: new Date().toISOString(),
                environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
                build_version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_VERSION ?? null,
                timezone: "UTC",
            },
        }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return NextResponse.json({ code: "health_unavailable" }, { status: 503 });
    }
}
