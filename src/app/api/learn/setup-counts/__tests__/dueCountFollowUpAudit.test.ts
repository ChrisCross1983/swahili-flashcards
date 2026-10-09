import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Card = { id: string; owner_key: string; type: "vocab" | "sentence" | null };
type Progress = { card_id: string; owner_key: string; level: number; due_date: string | null };
type Row = Card | Progress | (Progress & { cards: Card });

const fixture = vi.hoisted(() => ({
  cards: [] as Card[],
  progress: [] as Progress[],
}));

class FakeQuery {
  private selection = "*";
  private options: { count?: string; head?: boolean } = {};
  private filters: Array<(row: Row) => boolean> = [];
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
      this.filters.push((row) => String(row[column as keyof Row]) === value);
    }
    return this;
  }

  lte(column: string, value: string) {
    this.filters.push((row) => {
      const field = row[column as keyof Row];
      return typeof field === "string" && field <= value;
    });
    return this;
  }

  in(column: string, values: string[]) {
    this.filters.push((row) => values.includes(String(row[column as keyof Row])));
    return this;
  }

  or(filter: string) {
    if (filter === "type.is.null,type.eq.vocab") this.typeFilter = "vocab";
    return this;
  }

  order() { return this; }

  then(onFulfilled: (result: { data: Row[] | null; count: number | null; error: null }) => unknown) {
    let rows: Row[];
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
    // Model the configured PostgREST row cap on ordinary list responses.
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

import { GET as getStats } from "@/app/api/learn/stats/route";
import { GET as getSetup } from "@/app/api/learn/setup-counts/route";
import { GET as getToday } from "@/app/api/learn/today/route";

const request = (endpoint: string) =>
  new Request(`http://localhost/api/learn/${endpoint}?type=vocab`);
const stats = async () => (await getStats(request("stats"))).json();
const setup = async () => (await getSetup(request("setup-counts"))).json();
const today = async () => (await getToday(request("today"))).json();

function add(id: string, due: string | null, level = 1, type: Card["type"] = "vocab", owner = "user-a") {
  fixture.cards.push({ id, owner_key: owner, type });
  fixture.progress.push({ card_id: id, owner_key: owner, due_date: due, level });
}

describe("due-count follow-up and Home integration", () => {
  beforeEach(() => {
    fixture.cards.length = 0;
    fixture.progress.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("agrees below 1,000 rows across overdue, today, new, learning and review states", async () => {
    add("overdue", "2026-10-08", 2);
    add("today", "2026-10-09", 2);
    add("new", "2026-10-09", 0, null);
    add("learning", "2026-10-09", 1);
    add("review", "2026-10-09", 5);
    add("future", "2026-10-10", 3);
    add("unscheduled", null, 0);
    add("sentence", "2026-10-09", 0, "sentence");
    add("other-owner", "2026-10-09", 0, "vocab", "user-b");
    fixture.progress.push({ card_id: "deleted", owner_key: "user-a", due_date: "2026-10-09", level: 0 });
    expect((await stats()).dueTodayCount).toBe(5);
    expect((await setup()).todayDue).toBe(5);
    expect((await today()).items).toHaveLength(5);
  });

  it("reproduces the old >1,000-row undercount, never a 23-to-22 overcount at one snapshot", async () => {
    for (let i = 0; i < 1_000; i++) add(`card-${i}`, i < 63 ? "2026-10-09" : "2026-10-10");
    for (let i = 0; i < 3; i++) add(`tail-${i}`, "2026-10-09");
    expect((await stats()).dueTodayCount).toBe(63);
    expect((await setup()).todayDue).toBe(66);
    expect((await today()).items).toHaveLength(66);
  });

  it("can yield Home 23 then Trainer 22 if one due row changes between requests", async () => {
    for (let i = 0; i < 23; i++) add(`due-${i}`, "2026-10-09");
    expect((await stats()).dueTodayCount).toBe(23);
    fixture.progress[22].due_date = "2026-10-10";
    expect((await setup()).todayDue).toBe(22);
    expect((await today()).items).toHaveLength(22);
  });

  it("uses the UTC date boundary for all three endpoints", async () => {
    add("midnight", "2026-10-09");
    vi.setSystemTime(new Date("2026-10-08T21:30:00Z"));
    expect((await stats()).dueTodayCount).toBe(0);
    expect((await setup()).todayDue).toBe(0);
    expect((await today()).items).toHaveLength(0);
    vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
    expect((await stats()).dueTodayCount).toBe(1);
    expect((await setup()).todayDue).toBe(1);
    expect((await today()).items).toHaveLength(1);
  });

  it("can change the queue after setup count, but does not impose a daily cap below 1,000", async () => {
    for (let i = 0; i < 80; i++) add(`due-${i}`, "2026-10-09");
    expect((await setup()).todayDue).toBe(80);
    expect((await today()).items).toHaveLength(80);
    fixture.progress[0].due_date = "2026-10-10";
    expect((await today()).items).toHaveLength(79);
  });

  it("documents Home-to-Trainer navigation without a page reload", () => {
    const home = fs.readFileSync(path.join(process.cwd(), "src/app/HomeClient.tsx"), "utf8");
    const trainer = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");
    expect(home).toContain('onClick={() => router.push("/trainer")}');
    expect(trainer).toContain("void refreshSetupCounts();");
    expect(trainer).toContain("const counts = await fetchSetupCounts(cardType)");
  });

  it("documents fresh initial Home loading after a hard reload", () => {
    const home = fs.readFileSync(path.join(process.cwd(), "src/app/HomeClient.tsx"), "utf8");
    const api = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/api.ts"), "utf8");
    expect(home).toContain("void loadDueCount();");
    expect(home).toContain('fetchSetupCounts("vocab", undefined, controller.signal)');
    expect(home).not.toContain("/api/learn/stats?type=");
    expect(api).toContain('withFilterParams("/api/learn/setup-counts", cardType, groupIds)');
    expect(api).toContain('cache: "no-store"');
  });

  it("documents focus refresh and stale-response guards in both views", () => {
    const home = fs.readFileSync(path.join(process.cwd(), "src/app/HomeClient.tsx"), "utf8");
    const trainer = fs.readFileSync(path.join(process.cwd(), "src/app/trainer/TrainerClient.tsx"), "utf8");
    expect(home).toContain('window.addEventListener("focus", refreshWhenActive)');
    expect(home).toContain('document.addEventListener("visibilitychange", refreshWhenActive)');
    expect(home).toContain("activeRequest?.abort()");
    expect(home).toContain("requestId !== requestGeneration");
    expect(trainer).toContain("requestId !== setupCountsRequestIdRef.current");
  });
});
