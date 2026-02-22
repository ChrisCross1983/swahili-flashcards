"use client";

import { useState } from "react";
import type { CardType } from "@/lib/trainer/types";
import { useAiCoachSession } from "@/lib/aiCoach/hooks";

type Props = {
    cardType: CardType;
};

export default function AiCoachPanel({ cardType }: Props) {
    const { state, accuracy, startSession, submitAnswer, nextTask, endSession } = useAiCoachSession(cardType);
    const [answer, setAnswer] = useState("");

    const canSubmit = state.status === "in_task" && answer.trim().length > 0;

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
                    {state.currentTask.hint ? <div className="mt-2 text-xs text-muted">{state.currentTask.hint}</div> : null}
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
                <button type="button" className="btn btn-secondary" onClick={() => { setAnswer(""); void nextTask(); }} disabled={state.status !== "showing_result"}>
                    Nächste Aufgabe
                </button>
                <button type="button" className="btn btn-ghost" onClick={endSession} disabled={state.status === "idle" || state.status === "loading"}>
                    Session beenden
                </button>
            </div>

            {state.lastResult ? (
                <div className="rounded-2xl border border-soft p-3">
                    <div className="font-medium">{state.lastResult.correct ? "✅ Richtig" : "❌ Noch nicht"} · Score: {Math.round(state.lastResult.score * 100)}%</div>
                    <div className="text-sm text-muted mt-1">{state.lastResult.feedback}</div>
                </div>
            ) : null}

            {state.status === "loading" || state.status === "evaluating" ? <div className="text-sm text-muted">Lade…</div> : null}
            {state.error ? <div className="text-sm text-danger">{state.error}</div> : null}
        </div>
    );
}
