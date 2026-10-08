import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CardRow = { id: string; owner_key: string; type: "vocab" | "sentence" | null };
type ProgressRow = { card_id: string; owner_key: string; level: number; due_date: string | null };
type QueryRow = CardRow | ProgressRow | (ProgressRow & { cards: CardRow });

const fixture = vi.hoisted(() => ({
    cards: [] as CardRow[],
    progress: [] as ProgressRow[],
}));

class FakeQuery {
    private selection = "*";
    private options: { count?: string; head?: boolean } = {};
    private filters: Array<(row: QueryRow) => boolean> = [];
    private typeFilter: "vocab" | "sentence" | null = null;

    constructor(private readonly table: string) {}

    select(selection: string, options?: { count?: string; head?: boolean }) {
        this.selection = selection;
        this.options = options ?? {};
        return this;
    }

    eq(column: string, value: string) {
        if (column === "cards.type" || column === "type") {
            this.typeFilter = value as "vocab" | "sentence";
        } else {
            this.filters.push((row) => String(row[column as keyof QueryRow]) === value);
        }
        return this;
    }

    lte(column: string, value: string) {
        this.filters.push((row) => {
            const field = row[column as keyof QueryRow];
            return typeof field === "string" && field <= value;
        });
        return this;
    }

    or(filter: string) {
        if (filter === "type.is.null,type.eq.vocab") this.typeFilter = "vocab";
        return this;
    }

    in(column: string, values: string[]) {
        this.filters.push((row) => values.includes(String(row[column as keyof QueryRow])));
        return this;
    }

    order() {
        return this;
    }

    then(onFulfilled: (result: { data: QueryRow[] | null; count: number | null; error: null }) => unknown) {
        let rows: QueryRow[];
        if (this.table === "cards") {
            rows = [...fixture.cards];
        } else if (this.table === "card_progress") {
            rows = fixture.progress.flatMap((progress) => {
                const card = fixture.cards.find((entry) => entry.id === progress.card_id);
                if (this.selection.includes("cards!inner") && !card) return [];
                return card ? [{ ...progress, cards: card }] : [progress];
            });
        } else {
            rows = [];
        }

        rows = rows.filter((row) => {
            if (!this.filters.every((filter) => filter(row))) return false;
            if (!this.typeFilter) return true;
            const card = "cards" in row ? row.cards : "type" in row ? row : null;
            if (!card) return false;
            return this.typeFilter === "sentence"
                ? card.type === "sentence"
                : card.type === "vocab" || card.type === null;
        });
        const count = this.options.count === "exact" ? rows.length : null;
        // PostgREST's configured maximum is 1,000 rows for a normal list response.
        const data = this.options.head ? null : rows.slice(0, 1_000);
        return Promise.resolve(onFulfilled({ data, count, error: null }));
    }
}

vi.mock("@/lib/supabaseServer", () => ({
    supabaseServer: { from: (table: string) => new FakeQuery(table) },
}));

vi.mock("@/lib/api/auth", () => ({
    requireUser: async () => ({ user: { id: "user-a" }, response: null }),
}));

import { GET as getSetupCounts } from "@/app/api/learn/setup-counts/route";
import { GET as getTodayItems } from "@/app/api/learn/today/route";
import { GET as getLegacyStats } from "@/app/api/learn/stats/route";

const setupRequest = () => new Request("http://localhost/api/learn/setup-counts?type=vocab");
const todayRequest = () => new Request("http://localhost/api/learn/today?type=vocab");

function addCard(id: string, dueDate: string | null, level: number, type: CardRow["type"] = "vocab", owner = "user-a") {
    fixture.cards.push({ id, owner_key: owner, type });
    fixture.progress.push({ card_id: id, owner_key: owner, due_date: dueDate, level });
}

describe("shared Home/Trainer due-count source", () => {
    beforeEach(() => {
        fixture.cards.length = 0;
        fixture.progress.length = 0;
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    });

    afterEach(() => vi.useRealTimers());

    it("counts overdue, due today, new, learning and review cards like the actual Today queue", async () => {
        addCard("overdue", "2026-10-07", 2);
        addCard("today", "2026-10-08", 2);
        addCard("new", "2026-10-08", 0, null);
        addCard("learning", "2026-10-08", 1);
        addCard("review", "2026-10-08", 5);
        addCard("future", "2026-10-09", 3);
        addCard("unscheduled", null, 0);
        addCard("sentence", "2026-10-08", 0, "sentence");
        addCard("other-user", "2026-10-08", 0, "vocab", "user-b");
        fixture.progress.push({ card_id: "deleted", owner_key: "user-a", due_date: "2026-10-08", level: 0 });

        const setup = await (await getSetupCounts(setupRequest())).json();
        const queue = await (await getTodayItems(todayRequest())).json();
        expect(setup.todayDue).toBe(5);
        expect(queue.items.map((item: { cardId: string }) => item.cardId)).toEqual([
            "overdue", "today", "new", "learning", "review",
        ]);
    });

    it("uses the existing UTC date boundary, not the browser's local calendar day", async () => {
        addCard("utc-tomorrow", "2026-10-08", 0);
        vi.setSystemTime(new Date("2026-10-07T21:30:00Z")); // 00:30 in Dar es Salaam
        expect((await (await getSetupCounts(setupRequest())).json()).todayDue).toBe(0);
        vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
        expect((await (await getSetupCounts(setupRequest())).json()).todayDue).toBe(1);
    });

    it("updates the count after a card is graded out of today's queue", async () => {
        addCard("graded", "2026-10-08", 1);
        expect((await (await getSetupCounts(setupRequest())).json()).todayDue).toBe(1);
        fixture.progress[0].due_date = "2026-10-09";
        expect((await (await getSetupCounts(setupRequest())).json()).todayDue).toBe(0);
        expect((await (await getTodayItems(todayRequest())).json()).items).toHaveLength(0);
    });

    it("keeps an exact due count when an old stats list hits the 1,000-row cap", async () => {
        for (let index = 0; index < 1_000; index += 1) {
            addCard(`card-${index}`, index < 63 ? "2026-10-08" : "2026-10-09", 1);
        }
        for (let index = 0; index < 3; index += 1) addCard(`tail-${index}`, "2026-10-08", 1);

        const oldStats = await (await getLegacyStats(new Request("http://localhost/api/learn/stats?type=vocab"))).json();
        const setup = await (await getSetupCounts(setupRequest())).json();
        const queue = await (await getTodayItems(todayRequest())).json();
        expect(oldStats.dueTodayCount).toBe(63); // Documents the former Home bug.
        expect(setup.todayDue).toBe(66);
        expect(queue.items).toHaveLength(66);

        const homeSource = fs.readFileSync(path.join(process.cwd(), "src/app/HomeClient.tsx"), "utf8");
        expect(homeSource).toContain('fetchSetupCounts("vocab", undefined, controller.signal)');
        expect(homeSource).not.toContain('/api/learn/stats?type=');
        expect(homeSource).toContain("setTodayDueCount(counts.todayDue)");
        expect(homeSource).toContain('window.addEventListener("focus", refreshWhenActive)');
        expect(homeSource).toContain('document.addEventListener("visibilitychange", refreshWhenActive)');
    });
});
