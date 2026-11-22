type Mode = "LEITNER_TODAY" | "DRILL";
type Kind = "today" | "all_cards" | "last_missed" | "repair_drill";
type RunMessage = Record<string, string | number | boolean | null>;
type Send = (message: RunMessage) => Promise<void>;
export type LearningRunResume = { id: string; sequence: number; loadedCount: number; position: number; correct: number; wrong: number; mode: Mode; kind: Kind };

const CHECKPOINT_GRADES = 10;
const CHECKPOINT_MS = 45_000;
const HEARTBEAT_MS = 60_000;
let ingestUnavailableUntil = 0;

async function sendRun(message: RunMessage): Promise<void> {
    if (Date.now() < ingestUnavailableUntil) return;
    // Raw fetch is intentional: failures of Diagnostics must never be reported recursively.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await fetch("/api/diagnostics/runs", {
                method: "POST", headers: { "Content-Type": "application/json" },
                credentials: "same-origin", keepalive: true, body: JSON.stringify(message),
                signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(5_000) : undefined,
            });
            if (response.status === 503) {
                ingestUnavailableUntil = process.env.NODE_ENV === "production" ? Date.now() + 60_000 : Infinity;
                return;
            }
            if (response.ok || response.status < 500) return;
        } catch { /* One retry covers transient network failure; app work never awaits this. */ }
    }
}

export function resetRunIngestForTests(): void { ingestUnavailableUntil = 0; }

function buildVersion(): string | null {
    const value = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? null;
    return value && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : null;
}

export class LearningRunDiagnostics {
    private id: string | null = null;
    private sequence = 0;
    private active = false;
    private paused = false;
    private ended = false;
    private disposed = false;
    private loadedCount = 0;
    private position = 0;
    private correct = 0;
    private wrong = 0;
    private sinceCheckpoint = 0;
    private gradeSinceCheckpoint = false;
    private lastCheckpointAt = 0;
    private gradeFailed = false;
    private sessionSaveFailed = false;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private checkpointTimer: ReturnType<typeof setTimeout> | null = null;
    private pending: Promise<void> = Promise.resolve();

    constructor(private readonly send: Send = sendRun, private readonly now: () => number = Date.now) {}

    get runId(): string | null { return this.id; }

    resumeState(mode: Mode, kind: Kind): LearningRunResume | null {
        return this.id && this.active && !this.ended ? { id: this.id, sequence: this.sequence, loadedCount: this.loadedCount, position: this.position, correct: this.correct, wrong: this.wrong, mode, kind } : null;
    }

    restore(state: LearningRunResume): void {
        if (this.id || !/^[0-9a-f-]{36}$/i.test(state.id)) return;
        this.id = state.id;
        this.sequence = state.sequence;
        this.loadedCount = state.loadedCount;
        this.position = state.position;
        this.correct = state.correct;
        this.wrong = state.wrong;
        this.active = true;
        this.paused = false;
        this.ended = false;
        this.disposed = false;
        this.lastCheckpointAt = this.now();
        // Both operations are idempotent. They repair a start/loaded request lost during reload.
        this.enqueue({ action: "start", run_id: this.id, mode: state.mode, run_kind: state.kind, build_version: buildVersion() });
        this.enqueue({ action: "loaded", run_id: this.id, sequence_number: 1, initial_card_count: state.loadedCount });
        this.heartbeatTimer = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "visible") this.heartbeat();
        }, HEARTBEAT_MS);
    }

    private enqueue(message: RunMessage): void {
        this.pending = this.pending.then(() => this.send(message)).catch(() => {});
    }

    start(mode: Mode, kind: Kind): string | null {
        if (this.id && !this.ended) return this.id;
        this.stopTimers();
        try { this.id = crypto.randomUUID(); }
        catch { this.id = null; return null; }
        this.sequence = 0; this.active = false; this.paused = false; this.ended = false; this.disposed = false;
        this.loadedCount = 0;
        this.position = 0; this.correct = 0; this.wrong = 0;
        this.sinceCheckpoint = 0; this.gradeSinceCheckpoint = false;
        this.gradeFailed = false; this.sessionSaveFailed = false;
        this.lastCheckpointAt = this.now();
        this.enqueue({ action: "start", run_id: this.id, mode, run_kind: kind, build_version: buildVersion() });
        return this.id;
    }

    loaded(cardCount: number): void {
        if (!this.id || this.active || this.ended || this.disposed || !Number.isSafeInteger(cardCount) || cardCount < 0) return;
        this.active = true;
        this.paused = false;
        this.loadedCount = cardCount;
        this.sequence++;
        this.lastCheckpointAt = this.now();
        this.enqueue({ action: "loaded", run_id: this.id, sequence_number: this.sequence, initial_card_count: cardCount });
        if (cardCount > 0) this.heartbeatTimer = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "visible") this.heartbeat();
        }, HEARTBEAT_MS);
    }

    confirmed(correct: boolean, gradeConfirmed: boolean): void {
        if (!this.id || !this.active || this.ended || this.disposed || this.position >= this.loadedCount) return;
        this.position++;
        if (correct) this.correct++; else this.wrong++;
        if (gradeConfirmed) this.gradeSinceCheckpoint = true;
        this.sinceCheckpoint++;
        if (this.paused) return;
        if (this.sinceCheckpoint >= CHECKPOINT_GRADES || this.now() - this.lastCheckpointAt >= CHECKPOINT_MS) {
            this.checkpoint();
        } else if (!this.checkpointTimer) {
            this.checkpointTimer = setTimeout(() => { this.checkpointTimer = null; this.checkpoint(); }, CHECKPOINT_MS - (this.now() - this.lastCheckpointAt));
        }
    }

    checkpoint(): void {
        if (!this.id || !this.active || this.ended || this.disposed || this.sinceCheckpoint === 0) return;
        if (this.checkpointTimer) clearTimeout(this.checkpointTimer);
        this.checkpointTimer = null;
        this.sequence++;
        this.enqueue({ action: "checkpoint", run_id: this.id, sequence_number: this.sequence,
            last_position: this.position, correct_count: this.correct, wrong_count: this.wrong,
            grade_succeeded: this.gradeSinceCheckpoint });
        this.sinceCheckpoint = 0;
        this.gradeSinceCheckpoint = false;
        this.lastCheckpointAt = this.now();
    }

    heartbeat(): void {
        if (!this.id || !this.active || this.paused || this.ended || this.disposed) return;
        this.enqueue({ action: "heartbeat", run_id: this.id, sequence_number: this.sequence });
    }

    pause(): void { this.paused = true; this.stopTimers(); }

    markGradeFailure(): void { if (this.id && !this.ended) this.gradeFailed = true; }
    markSessionSaveFailure(): void { if (this.id && !this.ended) this.sessionSaveFailed = true; }

    end(reason: "completed" | "user_ended" | "navigation" | "load_failed" = "completed"): void {
        if (!this.id || this.ended || this.disposed) return;
        this.stopTimers();
        const failedReason = this.sessionSaveFailed ? "session_save_failed"
            : this.gradeFailed ? "grade_failed" : reason === "load_failed" ? "load_failed" : null;
        this.sequence++;
        this.enqueue({ action: "end", run_id: this.id, sequence_number: this.sequence,
            status: failedReason ? "failed" : reason === "completed" ? "completed" : "ended_early",
            end_reason: failedReason ?? reason, last_position: this.position,
            correct_count: this.correct, wrong_count: this.wrong,
            grade_succeeded: this.gradeSinceCheckpoint });
        this.ended = true;
        this.active = false;
    }

    // Unmount or an unconfirmed navigation is not proof of a crash. Leave the run open.
    dispose(): void { this.stopTimers(); this.active = false; this.disposed = true; }

    private stopTimers(): void {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        if (this.checkpointTimer) clearTimeout(this.checkpointTimer);
        this.heartbeatTimer = null; this.checkpointTimer = null;
    }

    async whenIdleForTests(): Promise<void> { await this.pending; }
}
