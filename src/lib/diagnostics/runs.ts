import { isUuid, optionalBuild } from "./validation";

const MODES = new Set(["LEITNER_TODAY", "DRILL"]);
const REASONS = new Set(["completed", "user_ended", "load_failed", "grade_failed", "session_save_failed", "navigation"]);
const MAX_CARDS = 100_000;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;

type Base = { run_id: string; sequence_number: number };
export type RunAction =
    | { action: "start"; run_id: string; mode: "LEITNER_TODAY" | "DRILL"; run_kind: "today" | "all_cards" | "last_missed" | "repair_drill" | null; build_version: string | null }
    | (Base & { action: "loaded"; initial_card_count: number })
    | (Base & { action: "checkpoint"; last_position: number; correct_count: number; wrong_count: number; grade_succeeded: boolean })
    | (Base & { action: "heartbeat" })
    | (Base & { action: "end"; status: "completed" | "ended_early" | "failed"; end_reason: string; last_position: number; correct_count: number; wrong_count: number; grade_succeeded: boolean });

const KEYS: Record<RunAction["action"], Set<string>> = {
    start: new Set(["action", "run_id", "mode", "run_kind", "build_version"]),
    loaded: new Set(["action", "run_id", "sequence_number", "initial_card_count"]),
    checkpoint: new Set(["action", "run_id", "sequence_number", "last_position", "correct_count", "wrong_count", "grade_succeeded"]),
    heartbeat: new Set(["action", "run_id", "sequence_number"]),
    end: new Set(["action", "run_id", "sequence_number", "status", "end_reason", "last_position", "correct_count", "wrong_count", "grade_succeeded"]),
};

function integer(value: unknown, max = MAX_CARDS): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

export function parseRunAction(value: unknown): RunAction | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    const action = data.action;
    if (typeof action !== "string" || !(action in KEYS) || !isUuid(data.run_id)) return null;
    const allowed = KEYS[action as RunAction["action"]];
    if (Object.keys(data).some((key) => !allowed.has(key))) return null;
    if (action === "start") {
        const build = optionalBuild(data.build_version);
        if (!MODES.has(String(data.mode)) || build === undefined) return null;
        const kind = data.run_kind == null ? null : data.run_kind;
        if (kind !== null && kind !== "today" && kind !== "all_cards" && kind !== "last_missed" && kind !== "repair_drill") return null;
        if (kind !== null && ((data.mode === "LEITNER_TODAY") !== (kind === "today"))) return null;
        return { action, run_id: data.run_id, mode: data.mode as "LEITNER_TODAY" | "DRILL", run_kind: kind, build_version: build };
    }
    if (!integer(data.sequence_number, MAX_SEQUENCE) || data.sequence_number < 1) return null;
    const base = { run_id: data.run_id, sequence_number: data.sequence_number };
    if (action === "loaded") {
        return integer(data.initial_card_count) ? { action, ...base, initial_card_count: data.initial_card_count } : null;
    }
    if (action === "heartbeat") return { action, ...base };
    if (action !== "checkpoint" && action !== "end") return null;
    if (!integer(data.last_position) || !integer(data.correct_count) || !integer(data.wrong_count) ||
        data.correct_count + data.wrong_count > data.last_position) return null;
    const counts = { last_position: data.last_position, correct_count: data.correct_count, wrong_count: data.wrong_count };
    if (action === "checkpoint") {
        if (data.grade_succeeded !== undefined && typeof data.grade_succeeded !== "boolean") return null;
        return { action, ...base, ...counts, grade_succeeded: data.grade_succeeded === true };
    }
    if ((data.status !== "completed" && data.status !== "ended_early" && data.status !== "failed") ||
        !REASONS.has(String(data.end_reason)) ||
        (data.status === "completed" && data.end_reason !== "completed") ||
        (data.status !== "completed" && data.end_reason === "completed") ||
        (data.grade_succeeded !== undefined && typeof data.grade_succeeded !== "boolean")) return null;
    return { action, ...base, ...counts, status: data.status, end_reason: String(data.end_reason), grade_succeeded: data.grade_succeeded === true };
}
