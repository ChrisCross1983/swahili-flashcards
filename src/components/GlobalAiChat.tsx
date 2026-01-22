"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChatProposal from "@/components/ChatProposal";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { CardProposal, Lang } from "@/lib/cards/proposals";
import {
    buildProposalsFromChat,
    detectSaveIntent,
    ProposalStatus,
} from "@/lib/cards/proposals";

type Props = {
    ownerKey: string;
    open: boolean;
    onClose: () => void;
};

type ProposalMessage = {
    kind: "proposal";
    role: "assistant";
    proposals: Array<CardProposal & { status: ProposalStatus }>;
};

type TextMessage = {
    kind: "text";
    role: "user" | "assistant";
    text: string;
};

type Msg = ProposalMessage | TextMessage;

export default function GlobalAiChat({ ownerKey, open, onClose }: Props) {
    const [mounted, setMounted] = useState(false);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const messagesEndRef = useAutoScroll<HTMLDivElement>([messages, open], open);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus();
    }, [open]);

    const textHistory = messages
        .filter((message): message is TextMessage => message.kind === "text")
        .map((message) => ({ role: message.role, text: message.text }));

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

    const updateProposal = useCallback(
        (
            proposalId: string,
            updater: (proposal: ProposalMessage["proposals"][number]) => ProposalMessage["proposals"][number]
        ) => {
            setMessages((prev) =>
                prev.map((message) => {
                    if (message.kind !== "proposal") return message;
                    return {
                        ...message,
                        proposals: message.proposals.map((proposal) =>
                            proposal.id === proposalId ? updater(proposal) : proposal
                        ),
                    };
                })
            );
        },
        []
    );

    const removeProposal = useCallback((proposalId: string) => {
        setMessages((prev) =>
            prev
                .map((message) => {
                    if (message.kind !== "proposal") return message;
                    return {
                        ...message,
                        proposals: message.proposals.filter(
                            (proposal) => proposal.id !== proposalId
                        ),
                    };
                })
                .filter((message) =>
                    message.kind === "proposal" ? message.proposals.length > 0 : true
                )
        );
    }, []);

    const handleSave = useCallback(
        async (proposalId: string) => {
            const proposalMessage = messages.find(
                (message) => message.kind === "proposal" && message.proposals.some((p) => p.id === proposalId)
            ) as ProposalMessage | undefined;

            const proposal = proposalMessage?.proposals.find((p) => p.id === proposalId);
            if (!proposal || proposal.missing_back) return;

            updateProposal(proposalId, (current) => ({
                ...current,
                status: { state: "saving" },
            }));

            try {
                const res = await fetch("/api/cards/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ownerKey,
                        type: proposal.type,
                        front_text: proposal.front_text,
                        back_text: proposal.back_text,
                        front_lang: proposal.front_lang,
                        back_lang: proposal.back_lang,
                        source: "chat",
                        context: proposal.source_context_snippet,
                        tags: proposal.tags ?? [],
                        notes: proposal.notes ?? null,
                    }),
                });

                const json = await res.json().catch(() => ({}));

                if (!res.ok) {
                    updateProposal(proposalId, (current) => ({
                        ...current,
                        status: {
                            state: "error",
                            message: json?.error ?? "Speichern fehlgeschlagen.",
                        },
                    }));
                    return;
                }

                if (json.status === "exists") {
                    updateProposal(proposalId, (current) => ({
                        ...current,
                        status: {
                            state: "exists",
                            existingId: json.existing_id,
                        },
                    }));
                    return;
                }

                updateProposal(proposalId, (current) => ({
                    ...current,
                    status: { state: "saved", id: json.id },
                }));
            } catch {
                updateProposal(proposalId, (current) => ({
                    ...current,
                    status: {
                        state: "error",
                        message: "Speichern fehlgeschlagen.",
                    },
                }));
            }
        },
        [messages, ownerKey, updateProposal]
    );

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || isSending) return;

        setIsSending(true);
        setError(null);

        setMessages((prev) => [...prev, { kind: "text", role: "user", text }]);
        setInput("");

        if (detectSaveIntent(text)) {
            const result = buildProposalsFromChat(text, textHistory);
            setMessages((prev) => {
                const next: Msg[] = [...prev];
                if (result.proposals.length > 0) {
                    next.push({
                        kind: "proposal",
                        role: "assistant",
                        proposals: result.proposals.map((proposal) => ({
                            ...proposal,
                            status: { state: "idle" },
                        })),
                    });
                }
                if (result.followUpText) {
                    next.push({
                        kind: "text",
                        role: "assistant",
                        text: result.followUpText,
                    });
                }
                return next;
            });
            setIsSending(false);
            inputRef.current?.focus();
            return;
        }

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

            setMessages((prev) => [
                ...prev,
                { kind: "text", role: "assistant", text: String(data.answer) },
            ]);
        } catch {
            setError("KI-Anfrage fehlgeschlagen.");
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    }, [input, isSending, ownerKey, textHistory]);

    if (!mounted || !document?.body) return null;

    return createPortal(
        <>
            {open ? (
                <div
                    className="fixed inset-0 z-[2147483646] flex items-start justify-center bg-[rgba(0,0,0,0.32)] p-4 sm:items-center"
                    onClick={close}
                >
                    <div
                        className="w-full max-w-xl rounded-2xl border-2 border-[rgba(255,240,220,0.45)] bg-[#a45f32] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">Swahili-KI 🦁</h2>
                                <p className="text-xs text-muted">
                                    Frag alles – unabhängig vom Training.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="rounded-full border border-[rgba(255,240,220,0.45)] bg-[rgba(255,240,220,0.1)] px-2 py-1 text-[11px] font-semibold text-[rgba(255,240,220,0.8)]">
                                    KI aktiv
                                </span>
                                <button
                                    type="button"
                                    aria-label="Schließen"
                                    className="rounded-full border border-soft px-3 py-1 text-sm text-muted transition hover:bg-surface"
                                    onClick={close}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Chat Verlauf: erst anzeigen, wenn es mindestens 1 Message gibt */}
                        {messages.length > 0 ? (
                            <div className="mb-3 max-h-72 overflow-y-auto rounded-xl border border-soft bg-surface p-3 [overflow-anchor:none]">
                                <div className="flex flex-col gap-2">
                                    {messages.map((m, idx) => (
                                        <div key={idx} className="flex flex-col">
                                            {m.kind === "text" ? (
                                                <div
                                                    className={[
                                                        "rounded-xl px-3 py-2 text-sm leading-5",
                                                        m.role === "user"
                                                            ? "self-end bg-accent-secondary text-on-accent"
                                                            : "self-start bg-surface text-primary border border-soft",
                                                    ].join(" ")}
                                                >
                                                    {m.text}
                                                </div>
                                            ) : (
                                                <div className="self-start w-full">
                                                    <div className="mb-2 text-xs text-muted">
                                                        Vorschläge aus dem Chat (No auto-save; always confirm)
                                                    </div>
                                                    <div className="flex flex-col gap-3">
                                                        {m.proposals.map((proposal) => (
                                                            <ChatProposal
                                                                key={proposal.id}
                                                                proposal={proposal}
                                                                status={proposal.status}
                                                                onUpdate={(update) =>
                                                                    updateProposal(proposal.id, (current) => ({
                                                                        ...current,
                                                                        ...update,
                                                                    }))
                                                                }
                                                                onSave={() => void handleSave(proposal.id)}
                                                                onDiscard={() => removeProposal(proposal.id)}
                                                                onSwap={() =>
                                                                    updateProposal(proposal.id, (current) => ({
                                                                        ...current,
                                                                        front_text: current.back_text,
                                                                        back_text: current.front_text,
                                                                        front_lang: current.back_lang,
                                                                        back_lang: current.front_lang,
                                                                        missing_back: current.back_text.trim().length === 0,
                                                                    }))
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mb-3 rounded-xl border border-cta bg-accent-cta-soft p-3 text-sm text-accent-cta">
                                {error}
                            </div>
                        ) : null}

                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Frage eingeben…"
                                className="w-full rounded-xl border border-soft px-4 py-3 text-base shadow-soft focus:border-accent focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={send}
                                disabled={isSending || !input.trim()}
                                className="rounded-xl bg-accent-primary px-4 py-3 text-sm text-on-accent disabled:opacity-60"
                            >
                                {isSending ? "…" : "Senden"}
                            </button>
                        </div>

                        <div className="mt-2 text-xs text-muted">
                            Tipp: „Gib mir 3 Beispielsätze“ oder „Erklär mir die Plural-Klasse“.
                        </div>
                    </div>
                </div>
            ) : null}
        </>,
        document.body
    );
}
