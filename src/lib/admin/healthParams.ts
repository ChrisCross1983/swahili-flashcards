import { isUuid } from "@/lib/diagnostics/validation";

export type HealthWindow = { from: string; to: string; label: string; period: "today" | "yesterday" | "7d" | "30d" | "custom" };

function midnightUtc(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, count: number): Date {
    return new Date(date.getTime() + count * 86_400_000);
}

function parseYmd(value: string | null): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function parseHealthWindow(params: URLSearchParams, now = new Date()): HealthWindow | null {
    const period = params.get("period") ?? "7d";
    const today = midnightUtc(now);
    let from: Date;
    let to: Date;
    if (period === "today") { from = today; to = addDays(today, 1); }
    else if (period === "yesterday") { from = addDays(today, -1); to = today; }
    else if (period === "7d") { from = addDays(today, -6); to = addDays(today, 1); }
    else if (period === "30d") { from = addDays(today, -29); to = addDays(today, 1); }
    else if (period === "custom") {
        const start = parseYmd(params.get("from"));
        const end = parseYmd(params.get("to"));
        if (!start || !end || end < start || end.getTime() - start.getTime() > 30 * 86_400_000 || end > today) return null;
        from = start; to = addDays(end, 1);
    } else return null;
    return { from: from.toISOString(), to: to.toISOString(), label: `${from.toISOString().slice(0, 10)}–${addDays(to, -1).toISOString().slice(0, 10)} UTC`, period };
}

export function parsePage(params: URLSearchParams, key = "page"): { page: number; pageSize: number; offset: number } | null {
    const rawPage = params.get(key) ?? "1";
    const rawSize = params.get("pageSize") ?? "25";
    if (!/^[1-9]\d{0,4}$/.test(rawPage) || !/^[1-9]\d{0,2}$/.test(rawSize)) return null;
    const page = Number(rawPage);
    const pageSize = Number(rawSize);
    if (pageSize > 50) return null;
    return { page, pageSize, offset: (page - 1) * pageSize };
}

export function parseOptionalUserId(params: URLSearchParams): string | null | undefined {
    const value = params.get("userId");
    return value === null || value === "" ? null : isUuid(value) ? value : undefined;
}
