"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SentenceTrainerClient() {
    const router = useRouter();
    const [started, setStarted] = useState(false);

    return (
        <main className="min-h-screen p-6 flex justify-center">
            <div className="w-full max-w-xl">
                <h1 className="text-2xl font-semibold">Satztrainer</h1>
                <p className="mt-1 text-sm text-gray-600">
                    Hier übst du, aus deinen Wörtern echte Sätze zu bauen.
                </p>

                <div className="mt-6 rounded-2xl border p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="text-sm font-semibold">Stufe 1 – Einfach</div>
                            <div className="text-sm text-gray-600">
                                Ich + Verb + X (z.B. Ninapenda chai.)
                            </div>
                        </div>

                        <button
                            className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:shadow-sm"
                            onClick={() => setStarted(true)}
                            type="button"
                        >
                            Start
                        </button>
                    </div>

                    {started && (
                        <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                            <div className="font-semibold">Coming next</div>
                            <div>Multiple Choice Aufgaben aus deinen Nomen-Karten.</div>
                        </div>
                    )}
                </div>

                <button
                    className="mt-8 rounded-xl border px-4 py-2 text-sm"
                    onClick={() => router.push("/")}
                    type="button"
                >
                    ← Zurück
                </button>
            </div>
        </main>
    );
}