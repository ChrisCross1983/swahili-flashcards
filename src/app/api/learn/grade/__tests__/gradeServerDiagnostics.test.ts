import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ from: vi.fn(), auth: vi.fn(), events: [] as Record<string, unknown>[] }));
vi.mock("@/lib/api/auth", () => ({ requireUser: fixture.auth }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from: fixture.from } }));

import { POST } from "@/app/api/learn/grade/route";

const userId = "ad0fa83f-e3c5-4cc1-8843-e0f12b355f28";
const runId = "dce974b9-2bb9-43cf-99d3-103a43c1723a";

beforeEach(() => {
    fixture.events.length = 0;
    fixture.auth.mockReset().mockResolvedValue({ user: { id: userId }, response: null });
    fixture.from.mockReset().mockImplementation((table: string) => {
        if (table === "card_progress") return { upsert: () => ({ select: async () => ({ data: null, error: { code: "PGRST116", message: "private DB detail" } }) }) };
        if (table === "learning_run_health") {
            const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { run_id: runId }, error: null }) };
            return query;
        }
        if (table === "app_diagnostic_events") {
            const query = {
                select: () => query, eq: () => query, gte: () => query,
                insert: async (row: Record<string, unknown>) => { fixture.events.push(row); return { error: null }; },
                then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ count: 0, error: null })),
            };
            return query;
        }
        throw new Error(`unexpected table ${table}`);
    });
});

describe("grade server diagnostics", () => {
    it("correlates a failed upsert without changing the Grade response", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const info = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            const response = await POST(new Request("https://app.test/api/learn/grade?token=secret", {
                method: "POST", headers: { "x-diagnostics-run-id": runId },
                body: JSON.stringify({ cardId: "private-card-text", correct: false, currentLevel: 0 }),
            }));
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ error: "Update failed." });
            await vi.waitFor(() => expect(fixture.events).toHaveLength(1));
            expect(fixture.events[0]).toMatchObject({
                source: "server", route: "/api/learn/grade", user_id: userId, run_id: runId,
                category: "supabase_failure", error_code: "db_card_progress_upsert_pgrst116", http_status: 500,
            });
            expect(JSON.stringify(fixture.events)).not.toMatch(/secret|private-card-text|private DB detail/);
        } finally { log.mockRestore(); info.mockRestore(); }
    });
});
