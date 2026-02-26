"use client";

import { useState } from "react";
import type { CardType } from "@/lib/trainer/types";
import { useAiCoachSession } from "@/lib/aiCoach/hooks";

type Props = {
    cardType: CardType;
};

function stripStatusPrefix(value: string) {
    return value.replace(/^\s*(✅\s*Richtig|🟨\s*Fast\s+richtig|❌\s*Noch\s+nicht\.?)[\s:\-]*?/i, "").trim();
}

function formatMnemonic(value: string) {
    return /^\s*Merksatz\s*:/i.test(value) ? value.trim() : `Merksatz: ${value.trim()}`;
}

export default function AiCoachPanel({ cardType }: Props) {
    const { state, accuracy, startSession, submitAnswer, revealHint, skip, nextTask, endSession } = useAiCoachSession(cardType);
    const [answer, setAnswer] = useState("");

    const canSubmit = state.status === "in_task" && answer.trim().length > 0;

    const visibleHints = state.currentTask?.hints?.slice(0, state.hintLevel) ?? (state.hintLevel > 0 && state.currentTask?.hint ? [state.currentTask.hint] : []);
    const hasHints = Boolean(state.currentTask?.hints?.length || state.currentTask?.hint);

    const statusHeadline = state.lastResult
        ? state.lastResult.correctness === "correct"
            ? "✅ Richtig"
            : state.lastResult.correctness === "almost"
                ? "🟨 Fast richtig"
                : "❌ Noch nicht"
        : null;

    const feedbackLine = (() => {
        if (!state.lastResult?.feedback) return null;
        const cleaned = stripStatusPrefix(state.lastResult.feedback);
        if (!cleaned || cleaned.toLowerCase() === statusHeadline?.toLowerCase()) return null;
        return cleaned;
    })();

    const mnemonicLine = state.lastResult?.mnemonic ? formatMnemonic(state.lastResult.mnemonic) : null;

    const handleNextTask = async () => {
        setAnswer("");
        await nextTask();
    };

    return (
        <div className="mt-6 rounded-3xl border border-soft bg-surface p-6 shadow-soft space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">KI-Coach</h2>
                <div className="text-sm text-muted">Trefferquote: {accuracy}%</div>
            </div>

            {state.status === "idle" || state.status === "finished" ? (
                <button type="button" className="btn btn-primary" onClick={startSession}>
                    Start KI Session
                </button>
            ) : null}

            {state.currentTask ? (
                <div className="rounded-2xl bg-surface-elevated p-4">
                    <div className="text-sm text-muted">Aufgabe ({state.currentTask.type})</div>
                    <div className="mt-1 font-semibold">{state.currentTask.prompt}</div>
                    {visibleHints.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-muted">
                            {visibleHints.map((hint, index) => (
                                <li key={`${hint}-${index}`}>💡 {hint}</li>
                            ))}
                        </ul>
                    ) : null}
                    {state.currentTask.meta?.repeated ? (
                        <div className="mt-2 text-xs text-muted">Nur 1 Karte verfügbar – Wiederholung ist aktuell unvermeidbar.</div>
                    ) : null}
                </div>
            ) : null}

            <textarea
                className="w-full rounded-2xl border border-soft bg-transparent p-3"
                rows={3}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Deine Antwort"
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && canSubmit) {
                        event.preventDefault();
                        void submitAnswer(answer);
                    }
                }}
                disabled={state.status !== "in_task"}
            />

            <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={() => submitAnswer(answer)} disabled={!canSubmit}>
                    Antwort prüfen
                </button>
                <button type="button" className="btn btn-secondary" onClick={revealHint} disabled={state.status !== "in_task" || !hasHints}>
                    💡 Tipp
                </button>
                <button type="button" className="btn btn-secondary" onClick={skip} disabled={state.status !== "in_task"}>
                    ⏭ Überspringen
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { void handleNextTask(); }} disabled={state.status !== "showing_result"}>
                    Nächste Aufgabe
                </button>
                <button type="button" className="btn btn-ghost" onClick={endSession} disabled={state.status === "idle" || state.status === "loading"}>
                    Session beenden
                </button>
            </div>

            {state.lastResult ? (
                <div className="rounded-2xl border border-soft p-3">
                    <div className="font-medium">{statusHeadline}</div>
                    {feedbackLine ? <div className="text-sm text-muted mt-1">{feedbackLine}</div> : null}
                    {state.lastResult.correctness !== "correct" ? (
                        <div className="text-sm mt-2">
                            Richtig wäre: <span className="font-medium">{state.lastResult.correctAnswer}</span>
                        </div>
                    ) : null}
                    {state.lastResult.why ? <div className="text-sm text-muted mt-1">Warum: {state.lastResult.why}</div> : null}
                    {mnemonicLine ? <div className="text-sm text-muted mt-1">{mnemonicLine}</div> : null}
                    {state.lastResult.correctness !== "correct" ? (
                        <div className="mt-2 h-2 rounded-full bg-surface-elevated">
                            <div
                                className={`h-2 rounded-full ${state.lastResult.correctness === "almost" ? "bg-yellow-500" : "bg-red-500"}`}
                                style={{ width: `${Math.round((state.lastResult.score ?? 0) * 100)}%` }}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}

            {state.status === "loading" || state.status === "evaluating" ? <div className="text-sm text-muted">Lade…</div> : null}
            {state.error ? <div className="text-sm text-danger">{state.error}</div> : null}
        </div>
    );
}
