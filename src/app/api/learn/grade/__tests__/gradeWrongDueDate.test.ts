import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ written: null as Record<string, unknown> | null }));

vi.mock("@/lib/api/auth", () => ({
    requireUser: async () => ({ user: { id: "user-a" }, response: null }),
}));

vi.mock("@/lib/supabaseServer", () => ({
    supabaseServer: {
        from: (table: string) => {
            if (table === "cards") {
                const query = {
                    select: () => query,
                    eq: () => query,
                    maybeSingle: async () => ({ data: { id: "card-a" }, error: null }),
                };
                return query;
            }
            return {
                upsert: (row: Record<string, unknown>) => {
                    fixture.written = row;
                    return { select: async () => ({ data: [row], error: null }) };
                },
            };
        },
    },
}));

import { POST } from "@/app/api/learn/grade/route";

describe("wrong Today grade", () => {
    afterEach(() => {
        vi.useRealTimers();
        fixture.written = null;
    });

    it("moves a missed card beyond today's due-date filter", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-16T23:30:00Z"));

        const response = await POST(new Request("http://localhost/api/learn/grade", {
            method: "POST",
            body: JSON.stringify({ cardId: "card-a", correct: false, currentLevel: 0 }),
        }));

        expect(response.status).toBe(200);
        expect(fixture.written).toMatchObject({
            owner_key: "user-a",
            card_id: "card-a",
            due_date: "2026-11-17",
        });
        expect(String(fixture.written?.due_date) > "2026-11-16").toBe(true);
    });

    it("applies each promotion interval, caps the last stage, and resets every wrong stage", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
        const expectedDays = [2, 6, 14, 30, 60, 60];
        for (let currentLevel = 0; currentLevel <= 5; currentLevel += 1) {
            for (const correct of [true, false]) {
                const response = await POST(new Request("http://localhost/api/learn/grade", {
                    method: "POST",
                    body: JSON.stringify({ cardId: "card-a", correct, currentLevel }),
                }));
                const expectedLevel = correct ? Math.min(currentLevel + 1, 5) : 0;
                const expectedDate = new Date(Date.UTC(2026, 10, 16 + (correct ? expectedDays[currentLevel] : 1))).toISOString().slice(0, 10);
                expect(response.status).toBe(200);
                expect(fixture.written).toMatchObject({ level: expectedLevel, due_date: expectedDate });
            }
        }
    });
});
