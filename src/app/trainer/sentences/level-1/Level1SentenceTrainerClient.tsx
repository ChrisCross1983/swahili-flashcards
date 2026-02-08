"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CardText from "@/components/ui/CardText";

type ExerciseOption = {
    id: string;
    de: string;
    sw: string;
    tag: string;
};

type Exercise = {
    prompt_de: string;
    prompt_sw: string | null;
    slotType: string;
    options: ExerciseOption[];
    answerId: string;
};

type Props = {
    ownerKey: string;
};

export default function Level1SentenceTrainerClient({ ownerKey }: Props) {
    const router = useRouter();
    const [exercise, setExercise] = useState<Exercise | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    async function loadExercise() {
        setLoading(true);
        setError(null);
        setSelectedId(null);

        try {
            const res = await fetch(
                `/api/sentence/level1?ownerKey=${encodeURIComponent(ownerKey)}`,
                { cache: "no-store" },
            );
            const json = await res.json();

            if (!res.ok) {
                setError(json.error ?? "Übung konnte nicht geladen werden.");
                setExercise(null);
                return;
            }

            setExercise(json as Exercise);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Übung konnte nicht geladen werden.";
            setError(message);
            setExercise(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadExercise();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isAnswered = selectedId !== null;

    function getOptionClasses(option: ExerciseOption) {
        const base =
            "w-full rounded-2xl border px-4 py-3 text-left text-lg font-semibold transition";

        if (!isAnswered) {
            return `${base} hover:shadow-soft`;
        }

        if (option.id === exercise?.answerId) {
            return `${base} border-success bg-accent-success-soft text-accent-success`;
        }

        if (option.id === selectedId) {
            return `${base} border-cta bg-accent-cta-soft text-accent-cta`;
        }

        return `${base} bg-surface text-primary opacity-75`;
    }

    return (
        <main className="min-h-screen p-6 flex justify-center">
            <div className="w-full max-w-2xl space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-accent-secondary font-semibold">Satztrainer</div>
                        <h1 className="text-2xl font-semibold">Stufe 1 – Einfach</h1>
                        <p className="text-sm text-muted mt-1">
                            Wähle das passende Wort, um den Satz zu vervollständigen.
                        </p>
                    </div>

                    <button
                        className="text-sm text-muted underline-offset-4 hover:underline"
                        onClick={() => router.push("/sentence-trainer")}
                        type="button"
                    >
                        ← Zurück
                    </button>
                </div>

                <div className="rounded-2xl border border-soft bg-surface p-5 shadow-soft">
                    {error && (
                        <div className="rounded-xl border border-cta bg-accent-cta-soft p-3 text-sm text-accent-cta">
                            {error}
                        </div>
                    )}

                    {!error && (
                        <>
                            <div className="text-sm text-muted">Setze ein Wort ein:</div>
                            <div className="mt-2 text-2xl font-semibold">
                                {exercise ? <CardText>{exercise.prompt_de}</CardText> : "Lade Übung ..."}
                            </div>

                            <div className="mt-6 space-y-3">
                                {exercise?.options.map((option) => (
                                    <button
                                        key={option.id}
                                        className={getOptionClasses(option)}
                                        disabled={loading || isAnswered}
                                        onClick={() => setSelectedId(option.id)}
                                        type="button"
                                    >
                                        <CardText>{option.de}</CardText>
                                        <CardText className="text-sm font-normal text-muted">{option.sw}</CardText>
                                    </button>
                                ))}

                                {!exercise && (
                                    <div className="text-sm text-muted">Noch keine Übung geladen.</div>
                                )}
                            </div>

                            <div className="mt-6 flex items-center justify-between">
                                <div className="text-sm font-semibold">
                                    {isAnswered && selectedId === exercise?.answerId && (
                                        <span className="text-green-700">Richtig!</span>
                                    )}
                                    {isAnswered && selectedId !== exercise?.answerId && (
                                        <span className="text-accent-cta">Leider falsch.</span>
                                    )}
                                </div>

                                <div className="flex items-center gap-3">
                                    {loading && <span className="text-sm text-muted">Lädt ...</span>}
                                    {isAnswered && (
                                        <button
                                            className="rounded-xl border bg-surface px-4 py-2 text-sm font-semibold transition hover:shadow-soft"
                                            onClick={loadExercise}
                                            type="button"
                                        >
                                            Nächste Übung
                                        </button>
                                    )}
                                    {!isAnswered && !loading && (
                                        <button
                                            className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:shadow-soft"
                                            onClick={loadExercise}
                                            type="button"
                                        >
                                            Neu laden
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}
