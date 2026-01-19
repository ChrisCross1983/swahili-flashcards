"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
    ownerKey: string;
    open: boolean;
    onClose: () => void;
};

type Msg = {
    role: "user" | "assistant";
    text: string;
};

export default function GlobalAiChat({ ownerKey, open, onClose }: Props) {
    const [mounted, setMounted] = useState(false);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus();
    }, [open]);

    const close = useCallback(() => {
        setError(null);
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close();
            }
        };

        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, close]);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || isSending) return;

        setIsSending(true);
        setError(null);

        setMessages((prev) => [...prev, { role: "user", text }]);
        setInput("");

        try {
            const r = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ownerKey,
                    message: text,
                    // bewusst KEIN context -> globale KI
                }),
            });

            const data = await r.json().catch(() => null);

            if (!r.ok || !data?.answer) {
                setError("KI-Anfrage fehlgeschlagen.");
                return;
            }

            setMessages((prev) => [...prev, { role: "assistant", text: String(data.answer) }]);
        } catch {
            setError("KI-Anfrage fehlgeschlagen.");
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    }, [input, isSending, ownerKey]);

    if (!mounted || !document?.body) return null;

    return createPortal(
        <>
            {open ? (
                <div
                    className="fixed inset-0 z-[2147483646] flex items-start justify-center bg-black/40 p-4 sm:items-center"
                    onClick={close}
                >
                    <div
                        className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">Swahili-KI 🦁</h2>
                                <p className="text-xs text-gray-500">
                                    Frag alles – unabhängig vom Training.
                                </p>
                            </div>

                            <button
                                type="button"
                                aria-label="Schließen"
                                className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-500 transition hover:bg-gray-100"
                                onClick={close}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Chat Verlauf: erst anzeigen, wenn es mindestens 1 Message gibt */}
                        {messages.length > 0 ? (
                            <div className="mb-3 max-h-72 overflow-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <div className="flex flex-col gap-2">
                                    {messages.map((m, idx) => (
                                        <div
                                            key={idx}
                                            className={[
                                                "rounded-xl px-3 py-2 text-sm leading-5",
                                                m.role === "user"
                                                    ? "self-end bg-black text-white"
                                                    : "self-start bg-white text-gray-900 border border-gray-200",
                                            ].join(" ")}
                                        >
                                            {m.text}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        ) : null}

                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Frage eingeben…"
                                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={send}
                                disabled={isSending || !input.trim()}
                                className="rounded-xl bg-black px-4 py-3 text-sm text-white disabled:opacity-50"
                            >
                                {isSending ? "…" : "Senden"}
                            </button>
                        </div>

                        <div className="mt-2 text-xs text-gray-400">
                            Tipp: „Gib mir 3 Beispielsätze“ oder „Erklär mir die Plural-Klasse“.
                        </div>
                    </div>
                </div>
            ) : null}
        </>,
        document.body
    );
}
