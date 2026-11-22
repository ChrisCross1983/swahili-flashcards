import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningRunDiagnostics, resetRunIngestForTests } from "./learningRun";

type Message = Record<string, string | number | boolean | null>;

function harness() {
    const messages: Message[] = [];
    const send = vi.fn(async (message: Message) => { messages.push(message); });
    const run = new LearningRunDiagnostics(send, () => Date.now());
    return { run, messages, send };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); resetRunIngestForTests(); });

describe("learning run diagnostics", () => {
    it("continues a reloaded run with its original ID and monotone sequence", async () => {
        const first = harness();
        first.run.start("LEITNER_TODAY", "today"); first.run.loaded(12);
        for (let index = 0; index < 10; index++) first.run.confirmed(true, true);
        const state = first.run.resumeState("LEITNER_TODAY", "today");
        expect(state).toMatchObject({ position: 10, sequence: 2 });
        first.run.dispose();
        const restored = harness();
        restored.run.restore(state!);
        restored.run.confirmed(false, true);
        restored.run.end();
        await restored.run.whenIdleForTests();
        expect(restored.messages[0]).toMatchObject({ action: "start", run_id: state!.id });
        expect(restored.messages.at(-1)).toMatchObject({ action: "end", run_id: state!.id, sequence_number: 3, last_position: 11, correct_count: 10, wrong_count: 1 });
    });
    it("creates one run ID only at a real start and loads the actual card count", async () => {
        const { run, messages } = harness();
        expect(run.runId).toBeNull();
        const id = run.start("LEITNER_TODAY", "today");
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        expect(run.start("LEITNER_TODAY", "today")).toBe(id);
        run.loaded(127);
        await run.whenIdleForTests();
        expect(messages).toMatchObject([
            { action: "start", run_id: id, mode: "LEITNER_TODAY", run_kind: "today" },
            { action: "loaded", run_id: id, initial_card_count: 127, sequence_number: 1 },
        ]);
        run.end();
        await run.whenIdleForTests();
    });

    it("checkpoints after ten confirmed grades and after 45 seconds of pending progress", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
        const { run, messages } = harness();
        run.start("LEITNER_TODAY", "today"); run.loaded(20);
        for (let i = 0; i < 10; i++) run.confirmed(i < 7, true);
        await run.whenIdleForTests();
        expect(messages.filter((m) => m.action === "checkpoint")).toMatchObject([
            { last_position: 10, correct_count: 7, wrong_count: 3, sequence_number: 2, grade_succeeded: true },
        ]);
        run.confirmed(false, true);
        await vi.advanceTimersByTimeAsync(45_000);
        await run.whenIdleForTests();
        expect(messages.filter((m) => m.action === "checkpoint")).toHaveLength(2);
        expect(messages.at(-1)).toMatchObject({ action: "checkpoint", last_position: 11, correct_count: 7, wrong_count: 4, sequence_number: 3 });
        run.end();
        await run.whenIdleForTests();
    });

    it("never counts a failed Today grade and marks the run failed", async () => {
        const { run, messages } = harness();
        run.start("LEITNER_TODAY", "today"); run.loaded(2);
        run.confirmed(true, true);
        run.markGradeFailure(); // The second tap did not receive a successful /grade response.
        run.end();
        await run.whenIdleForTests();
        expect(messages.at(-1)).toMatchObject({ action: "end", status: "failed", end_reason: "grade_failed", last_position: 1, correct_count: 1, wrong_count: 0, grade_succeeded: true });
    });

    it("ends a complete Drill and an early Last-Missed run exactly once", async () => {
        const { run, messages } = harness();
        run.start("DRILL", "all_cards"); run.loaded(1); run.confirmed(false, false);
        run.end(); run.end();
        await run.whenIdleForTests();
        expect(run.runId).toBe(messages[0].run_id);
        expect(messages.filter((m) => m.action === "end")).toMatchObject([
            { status: "completed", end_reason: "completed", last_position: 1, wrong_count: 1 },
        ]);
        const second = run.start("DRILL", "last_missed");
        run.loaded(3); run.confirmed(true, false); run.end("user_ended");
        await run.whenIdleForTests();
        expect(second).not.toBe(messages[0].run_id);
        expect(messages.at(-1)).toMatchObject({ action: "end", run_id: second, status: "ended_early", end_reason: "user_ended", correct_count: 1 });
    });

    it("marks session-save failure and keeps overlapping rounds distinct", async () => {
        const first = harness();
        first.run.start("LEITNER_TODAY", "today"); first.run.loaded(1); first.run.confirmed(true, true);
        const second = harness();
        second.run.start("DRILL", "repair_drill"); second.run.loaded(1);
        first.run.markSessionSaveFailure(); first.run.end(); second.run.confirmed(false, false); second.run.end();
        await Promise.all([first.run.whenIdleForTests(), second.run.whenIdleForTests()]);
        expect(first.messages.at(-1)).toMatchObject({ status: "failed", end_reason: "session_save_failed" });
        expect(second.messages.at(-1)).toMatchObject({ status: "completed", run_id: second.run.runId ?? second.messages[0].run_id });
        expect(first.messages[0].run_id).not.toBe(second.messages[0].run_id);
    });

    it("heartbeats only while active and visible; unmount leaves an open run", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
        const visibility = { visibilityState: "visible" };
        vi.stubGlobal("document", visibility);
        const { run, messages } = harness();
        run.start("DRILL", "all_cards"); run.loaded(100);
        await vi.advanceTimersByTimeAsync(60_000);
        await run.whenIdleForTests();
        expect(messages.filter((m) => m.action === "heartbeat")).toMatchObject([{ sequence_number: 1 }]);
        visibility.visibilityState = "hidden";
        await vi.advanceTimersByTimeAsync(120_000);
        await run.whenIdleForTests();
        expect(messages.filter((m) => m.action === "heartbeat")).toHaveLength(1);
        visibility.visibilityState = "visible";
        run.pause();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(messages.filter((m) => m.action === "heartbeat")).toHaveLength(1);
        run.dispose();
        await vi.advanceTimersByTimeAsync(180_000);
        await run.whenIdleForTests();
        expect(messages.filter((m) => m.action === "heartbeat")).toHaveLength(1);
        expect(messages.some((m) => m.action === "end")).toBe(false);
    });

    it("stops heartbeats after completion and records a failed load without a false crash", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("document", { visibilityState: "visible" });
        const { run, messages } = harness();
        run.start("LEITNER_TODAY", "today"); run.loaded(1); run.confirmed(true, true); run.end();
        await vi.advanceTimersByTimeAsync(120_000);
        await run.whenIdleForTests();
        expect(messages.filter((m) => m.action === "heartbeat")).toHaveLength(0);
        run.start("DRILL", "last_missed"); run.end("load_failed");
        await run.whenIdleForTests();
        expect(messages.at(-1)).toMatchObject({ action: "end", status: "failed", end_reason: "load_failed" });
    });

    it.each([100, 150])("bounds writes for %i grades and keeps sequence numbers increasing", async (size) => {
        vi.useFakeTimers();
        const { run, messages } = harness();
        run.start("LEITNER_TODAY", "today"); run.loaded(size);
        for (let i = 0; i < size; i++) run.confirmed(i % 2 === 0, true);
        expect(vi.getTimerCount()).toBe(1); // One heartbeat interval; no per-card timer survives a checkpoint.
        run.end();
        expect(vi.getTimerCount()).toBe(0);
        await run.whenIdleForTests();
        const checkpoints = messages.filter((m) => m.action === "checkpoint");
        expect(checkpoints).toHaveLength(size / 10);
        expect(messages).toHaveLength(size / 10 + 3); // start, loaded, checkpoints, end
        expect(checkpoints.map((m) => m.sequence_number)).toEqual(Array.from({ length: size / 10 }, (_, i) => i + 2));
        expect(messages.at(-1)).toMatchObject({ last_position: size, correct_count: size / 2, wrong_count: size / 2, sequence_number: size / 10 + 2 });
    });

    it("does not let a failed Diagnostics send interrupt the run", async () => {
        const send = vi.fn(async () => { throw new Error("offline"); });
        const run = new LearningRunDiagnostics(send);
        run.start("DRILL", "all_cards"); run.loaded(1); run.confirmed(true, false); run.end();
        await expect(run.whenIdleForTests()).resolves.toBeUndefined();
        expect(send).toHaveBeenCalledTimes(3);
    });
    it("stops sending further run updates after a 503 without blocking learning", async () => {
        const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
        vi.stubGlobal("fetch", fetchMock);
        const run = new LearningRunDiagnostics();
        run.start("LEITNER_TODAY", "today"); run.loaded(12);
        for (let i = 0; i < 12; i++) run.confirmed(true, true);
        run.end();
        await expect(run.whenIdleForTests()).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
