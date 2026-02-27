"use client";

import { useState } from "react";
import type { CardType } from "@/lib/trainer/types";
import { useAiCoachSession } from "@/lib/aiCoach/hooks";

type Props = {
    cardType: CardType;
};

export default function AiCoachPanel({ cardType }: Props) {
    const { state, accuracy, startSession, submitAnswer, revealHint, skip, retry, showExampleText, nextTask, endSession } = useAiCoachSession(cardType);
    const [answer, setAnswer] = useState("");

    const isInTask = state.status === "in_task";
    const hasResult = state.status === "showing_result" && state.lastResult;
    const lastResult = state.lastResult;
    const canSubmit = isInTask && answer.trim().length > 0;

    const handleNextTask = async () => {
        setAnswer("");
        await nextTask();
    };

    const handleRetry = () => {
        setAnswer("");
        retry();
    };

    return (
        <div className="mt-6 rounded-3xl border border-soft bg-surface p-6 shadow-soft space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">KI-Coach</h2>
                <div className="text-sm text-muted">Trefferquote: {accuracy}%</div>
            </div>

            {(state.status === "idle" || state.status === "finished") ? (
                <button type="button" className="btn btn-primary" onClick={startSession}>
                    Start KI Session
                </button>
            ) : null}

            {state.currentTask ? (
                <div className="rounded-2xl bg-surface-elevated p-4">
                    <div className="text-sm text-muted">Aufgabe ({state.currentTask.type})</div>
                    <div className="mt-1 font-semibold">{state.currentTask.prompt}</div>

                    {state.currentTask.type === "mcq" && state.currentTask.choices?.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {state.currentTask.choices.map((choice) => (
                                <button
                                    key={choice}
                                    type="button"
                                    className="btn btn-secondary text-left"
                                    disabled={!isInTask}
                                    onClick={() => { setAnswer(choice); }}
                                >
                                    {choice}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {state.showExample && state.currentTask.exampleSentence ? (
                        <div className="mt-2 text-sm text-muted">Beispiel: {state.currentTask.exampleSentence}</div>
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
                placeholder={state.currentTask?.type === "mcq" ? "Oder Option anklicken" : "Deine Antwort"}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && canSubmit) {
                        event.preventDefault();
                        void submitAnswer(answer);
                    }
                }}
                disabled={!isInTask}
            />

            {!hasResult ? (
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary" onClick={() => submitAnswer(answer)} disabled={!canSubmit}>
                        Antwort prüfen
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={revealHint} disabled={!isInTask}>
                        💡 Tipp
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={skip} disabled={!isInTask}>
                        ⏭ Überspringen
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={endSession} disabled={state.status === "idle" || state.status === "loading"}>
                        Session beenden
                    </button>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary" onClick={handleRetry} disabled={!lastResult?.actionHints.canRetry}>
                        Nochmal versuchen
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={showExampleText}>
                        Beispiel sehen
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => { void handleNextTask(); }}>
                        Weiter
                    </button>
                </div>
            )}

            {state.lastResult ? (
                <div className="rounded-2xl border border-soft p-3 text-sm">
                    <div className="font-medium">{state.lastResult.feedback.headline}</div>
                    {state.lastResult.feedback.analysis ? <div className="text-muted mt-1">Fehleranalyse: {state.lastResult.feedback.analysis}</div> : null}
                    {state.lastResult.feedback.hint ? <div className="text-muted mt-1">Lernhinweis: {state.lastResult.feedback.hint}</div> : null}
                    {state.lastResult.feedback.example ? <div className="text-muted mt-1">Beispiel: {state.lastResult.feedback.example}</div> : null}
                    {state.lastResult.feedback.solution ? (
                        <div className="mt-2">
                            Richtig wäre: <span className="font-medium">{state.lastResult.feedback.solution}</span>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {state.status === "loading" || state.status === "evaluating" ? <div className="text-sm text-muted">Lade…</div> : null}
            {state.error ? <div className="text-sm text-danger">{state.error}</div> : null}
        </div>
    );
}
