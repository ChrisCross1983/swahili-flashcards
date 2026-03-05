"use client";

import { useState } from "react";
import type { CardType } from "@/lib/trainer/types";
import { useAiCoachSession } from "@/lib/aiCoach/hooks";

type Props = {
    cardType: CardType;
};

export default function AiCoachPanel({ cardType }: Props) {
    const { state, accuracy, startSession, submitAnswer, revealHint, skip, retry, nextTask, endSession } = useAiCoachSession(cardType);
    const [answer, setAnswer] = useState("");

    const isInTask = state.status === "in_task";
    const hasResult = state.status === "showing_result" && state.lastResult;
    const lastResult = state.lastResult;
    const inputMode = state.currentTask?.ui?.inputMode ?? "text";
    const canSubmit = isInTask && answer.trim().length > 0;

    const handleChoice = (choice: string) => {
        if (!isInTask) return;
        setAnswer(choice);
        void submitAnswer(choice);
    };

    const handleNextTask = async () => {
        setAnswer("");
        await nextTask();
    };

    const handleRetry = () => {
        setAnswer("");
        retry();
    };

    const hintLevel = Math.min(state.hintLevel, 3);
    const currentHint = hintLevel > 0 ? state.currentTask?.hintLevels?.[hintLevel - 1] : null;
    const hintTotal = state.currentTask?.hintLevels?.length ?? 0;
    const hintButtonLabel = hintLevel < hintTotal ? `Tipp (${Math.min(hintLevel + 1, hintTotal)}/${hintTotal})` : `Alle Tipps angezeigt (${hintTotal}/${hintTotal})`;
    const hintDisabled = !isInTask || hintTotal === 0 || hintLevel >= hintTotal;

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
                    <div className="mt-1 font-semibold whitespace-pre-line">{state.currentTask.prompt}</div>

                    {currentHint ? (
                        <div className="mt-2 text-sm text-muted">
                            💡 Tipp {hintLevel}/{Math.max(hintTotal, 1)}: {currentHint}
                        </div>
                    ) : null}

                    {(inputMode === "mcq" || inputMode === "cloze_click") && state.currentTask.choices?.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {state.currentTask.choices.map((choice) => (
                                <button
                                    key={choice}
                                    type="button"
                                    className="btn btn-secondary text-left"
                                    disabled={!isInTask}
                                    onClick={() => handleChoice(choice)}
                                >
                                    {choice}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {state.currentTask.meta?.repeated ? (
                        <div className="mt-2 text-xs text-muted">Nur 1 Karte verfügbar – Wiederholung ist aktuell unvermeidbar.</div>
                    ) : null}
                </div>
            ) : null}

            {inputMode === "text" ? (
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
                    disabled={!isInTask}
                />
            ) : null}

            {!hasResult ? (
                <div className="flex flex-wrap gap-2">
                    {inputMode === "text" ? (
                        <button type="button" className="btn btn-primary" onClick={() => submitAnswer(answer)} disabled={!canSubmit}>
                            Antwort prüfen
                        </button>
                    ) : null}
                    <button type="button" className="btn btn-secondary" onClick={revealHint} disabled={hintDisabled}>
                        💡 {hintButtonLabel}
                    </button>
                    {state.currentTask?.type === "translate" ? (
                        <button type="button" className="btn btn-secondary" onClick={() => submitAnswer("I don't know")} disabled={!isInTask}>
                            Ich weiß nicht
                        </button>
                    ) : null}
                    <button type="button" className="btn btn-secondary" onClick={skip} disabled={!isInTask}>
                        ⏭ Überspringen
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={endSession} disabled={state.status === "idle" || state.status === "loading"}>
                        Session beenden
                    </button>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary" onClick={handleRetry} disabled={!lastResult?.retryAllowed}>
                        Nochmal versuchen
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => { void handleNextTask(); }}>
                        Nächste Aufgabe
                    </button>
                </div>
            )}

            {hasResult && state.lastResult ? (
                <div className="rounded-2xl border border-soft p-3 text-sm space-y-2">
                    <div className="font-medium">
                        {state.lastResult.correct ? "✅ Richtig" : state.lastResult.feedbackTitle === "Fast richtig" ? "⚠️ Fast richtig" : "❌ Noch nicht"}
                    </div>
                    <div>{state.lastResult.correct ? "Richtig:" : "Richtig ist:"} <span className="font-medium">{state.lastResult.correctAnswer}</span></div>
                    <div className="text-muted">{state.lastResult.feedback ?? "Gute Arbeit – weiter so."}</div>
                    <div className="text-muted">Tipp: {state.lastResult.learnTip}</div>
                    {state.lastResult.example ? (
                        <div className="text-muted">
                            <div>Swahili: {state.lastResult.example.sw}</div>
                            <div>Deutsch: {state.lastResult.example.de}</div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {state.status === "loading" || state.status === "evaluating" ? <div className="text-sm text-muted">Lade…</div> : null}
            {state.error ? <div className="text-sm text-danger">{state.error}</div> : null}
        </div>
    );
}
