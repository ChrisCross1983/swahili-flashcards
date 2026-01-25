"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChatProposal from "@/components/ChatProposal";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { CardProposal } from "@/lib/cards/proposals";
import {
    buildProposalsFromChat,
    detectSaveIntent,
    extractConceptsFromAssistantText,
    LastExplainedConcept,
    ProposalStatus,
} from "@/lib/cards/proposals";
import {
    canonicalizeToSwDe,
    looksLikeMetaText,
} from "@/lib/cards/saveFlow";
import type { TrainingContext } from "@/lib/aiContext";

type Props = {
    ownerKey: string;
    open: boolean;
    onClose: () => void;
    trainingContext?: TrainingContext | null;
};

type TextMessage = {
    kind: "text";
    role: "user" | "assistant";
    text: string;
};

type ProposalEntry = {
    kind: "proposal";
    proposal: CardProposal;
    status: ProposalStatus;
};

type Msg = TextMessage;

type InterpretResult =
    | { kind: "ask"; rewrittenUserMessage?: string }
    | { kind: "save"; items: SaveItem[]; reason?: string }
    | { kind: "clarify"; question: string; hints?: string[] };

type SaveItem = {
    type: "vocab" | "sentence";
    sw: string;
    de: string;
    source: "chat" | "training" | "user" | "assistant_list";
    confidence: number;
    why?: string;
};

type MessageBlock =
    | { type: "paragraph"; text: string }
    | { type: "list"; items: string[] };

function parseMessageBlocks(text: string): MessageBlock[] {
    const lines = text.split(/\r?\n/);
    const blocks: MessageBlock[] = [];
    let currentParagraph: string[] = [];
    let currentList: string[] = [];

    const flushParagraph = () => {
        if (!currentParagraph.length) return;
        blocks.push({ type: "paragraph", text: currentParagraph.join(" ").trim() });
        currentParagraph = [];
    };

    const flushList = () => {
        if (!currentList.length) return;
        blocks.push({ type: "list", items: currentList });
        currentList = [];
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            flushParagraph();
            flushList();
            continue;
        }

        const listMatch = trimmed.match(/^([-*•]|\d+[.)])\s+(.+)/);
        if (listMatch) {
            flushParagraph();
            currentList.push(listMatch[2].trim());
            continue;
        }

        flushList();
        currentParagraph.push(trimmed);
    }

    flushParagraph();
    flushList();

    if (blocks.length === 0 && text.trim()) {
        return [{ type: "paragraph", text: text.trim() }];
    }

    return blocks;
}

export default function GlobalAiChat({ ownerKey, open, onClose, trainingContext }: Props) {
    const [mounted, setMounted] = useState(false);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastGoodConcepts, setLastGoodConcepts] = useState<LastExplainedConcept[]>(
        []
    );
    const [proposals, setProposals] = useState<ProposalEntry[]>([]);

    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const messagesEndRef = useAutoScroll<HTMLDivElement>([messages, open], open);
    const proposalsRef = useRef<ProposalEntry[]>([]);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus();
    }, [open]);

    const textHistory: Array<{ role: "user" | "assistant"; text: string }> = messages
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

    useEffect(() => {
        proposalsRef.current = proposals;
    }, [proposals]);

    const updateLastConceptsFromAnswer = useCallback((answer: string) => {
        const concepts = extractConceptsFromAssistantText(answer, "answer");
        if (concepts.length > 0) {
            setLastGoodConcepts((prev) => [...prev, ...concepts].slice(-3));
        }
    }, []);

    const addAssistantMessage = useCallback((text: string) => {
        setMessages((prev) => [...prev, { kind: "text", role: "assistant", text }]);
    }, []);

    const buildInterpretTrainingContext = useCallback(
        (context: TrainingContext | null | undefined) => {
            if (!context) return null;
            const direction =
                context.direction === "DE_TO_SW"
                    ? "de->sw"
                    : context.direction === "SW_TO_DE"
                        ? "sw->de"
                        : undefined;

            if (direction === "de->sw") {
                return {
                    frontText: context.german || undefined,
                    backText: context.swahili || undefined,
                    direction,
                };
            }
            if (direction === "sw->de") {
                return {
                    frontText: context.swahili || undefined,
                    backText: context.german || undefined,
                    direction,
                };
            }

            return {
                frontText: context.swahili || context.german || undefined,
                backText: context.german || context.swahili || undefined,
                direction,
            };
        },
        []
    );

    const checkDuplicate = useCallback(
        async (sw: string, de: string) => {
            try {
                const res = await fetch("/api/cards/exists", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ownerKey, sw, de }),
                });

                const json = await res.json().catch(() => ({}));
                if (!res.ok) return null;
                return json;
            } catch {
                return null;
            }
        },
        [ownerKey]
    );

    const applyProposals = useCallback(
        async (items: SaveItem[]) => {
            const entries = await Promise.all(
                items.map(async (item) => {
                    const proposal: CardProposal = {
                        id: crypto.randomUUID(),
                        type: item.type,
                        front_lang: "sw",
                        back_lang: "de",
                        front_text: item.sw.trim(),
                        back_text: item.de.trim(),
                        source_label: item.source,
                        notes: item.why,
                    };
                    let status: ProposalStatus = { state: "idle" };
                    const existsResult = await checkDuplicate(
                        proposal.front_text,
                        proposal.back_text
                    );
                    if (existsResult?.exists) {
                        status = {
                            state: "exists",
                            existingId: existsResult.existing_id ?? "",
                        };
                    }
                    return { kind: "proposal" as const, proposal, status };
                })
            );
            setProposals(entries);
        },
        [checkDuplicate]
    );

    const updateProposal = useCallback(
        (id: string, update: Partial<CardProposal>) => {
            setProposals((prev) =>
                prev.map((entry) => {
                    if (entry.proposal.id !== id) return entry;
                    const nextProposal = { ...entry.proposal, ...update };
                    return { ...entry, proposal: nextProposal, status: { state: "idle" } };
                })
            );
        },
        []
    );

    const removeProposal = useCallback((id: string) => {
        setProposals((prev) => prev.filter((entry) => entry.proposal.id !== id));
    }, []);

    const setProposalStatus = useCallback((id: string, status: ProposalStatus) => {
        setProposals((prev) =>
            prev.map((entry) =>
                entry.proposal.id === id ? { ...entry, status } : entry
            )
        );
    }, []);

    const handleProposalSave = useCallback(
        async (proposalId: string) => {
            const entry = proposalsRef.current.find(
                (item) => item.proposal.id === proposalId
            );
            if (!entry) return;
            if (entry.status.state === "exists") return;

            const sw = entry.proposal.front_text.trim();
            const de = entry.proposal.back_text.trim();
            if (!sw || !de) {
                setProposalStatus(proposalId, {
                    state: "error",
                    message: "Bitte beide Seiten ergänzen, bevor gespeichert wird.",
                });
                return;
            }

            if (looksLikeMetaText(sw) || looksLikeMetaText(de)) {
                setProposalStatus(proposalId, {
                    state: "error",
                    message: "Bitte nur das Wortpaar speichern, kein Hinweistext.",
                });
                return;
            }

            setProposalStatus(proposalId, { state: "saving" });

            const canonical = canonicalizeToSwDe({
                front_lang: entry.proposal.front_lang,
                back_lang: entry.proposal.back_lang,
                front_text: sw,
                back_text: de,
            });

            try {
                const res = await fetch("/api/cards/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ownerKey,
                        type: entry.proposal.type,
                        front_text: canonical.sw,
                        back_text: canonical.de,
                        front_lang: "sw",
                        back_lang: "de",
                        source: "chat",
                        context: entry.proposal.source_context_snippet ?? null,
                    }),
                });

                const json = await res.json().catch(() => ({}));

                if (!res.ok) {
                    setProposalStatus(proposalId, {
                        state: "error",
                        message: json?.error ?? "Speichern fehlgeschlagen.",
                    });
                    return;
                }

                if (json.status === "exists") {
                    setProposalStatus(proposalId, {
                        state: "exists",
                        existingId: json.existing_id ?? "",
                    });
                    return;
                }

                setProposalStatus(proposalId, { state: "saved", id: json.id });
                window.setTimeout(() => removeProposal(proposalId), 600);
            } catch {
                setProposalStatus(proposalId, {
                    state: "error",
                    message: "Speichern fehlgeschlagen.",
                });
            }
        },
        [ownerKey, removeProposal, setProposalStatus]
    );

    const applyFallbackProposals = useCallback(
        async (fallbackProposals: CardProposal[]) => {
            const entries = await Promise.all(
                fallbackProposals.map(async (proposal) => {
                    let status: ProposalStatus = { state: "idle" };
                    if (proposal.front_text.trim() && proposal.back_text.trim()) {
                        const canonical = canonicalizeToSwDe({
                            front_lang: proposal.front_lang,
                            back_lang: proposal.back_lang,
                            front_text: proposal.front_text,
                            back_text: proposal.back_text,
                        });
                        const existsResult = await checkDuplicate(canonical.sw, canonical.de);
                        if (existsResult?.exists) {
                            status = {
                                state: "exists",
                                existingId: existsResult.existing_id ?? "",
                            };
                        }
                    }
                    return { kind: "proposal" as const, proposal, status };
                })
            );
            setProposals(entries);
        },
        [checkDuplicate]
    );

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || isSending) return;

        setIsSending(true);
        setError(null);

        setMessages((prev) => [...prev, { kind: "text", role: "user", text }]);
        setInput("");

        const nextHistory: Array<{ role: "user" | "assistant"; text: string }> = [
            ...textHistory,
            { role: "user" as const, text },
        ];

        const interpretPayload = {
            ownerKey,
            userMessage: text,
            chatHistory: nextHistory,
            trainingContext: buildInterpretTrainingContext(trainingContext),
        };

        let interpretResult: InterpretResult | null = null;

        try {
            const res = await fetch("/api/ai/interpret", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(interpretPayload),
            });

            const json = await res.json().catch(() => null);
            if (res.ok && json?.kind) {
                interpretResult = json as InterpretResult;
            } else if (process.env.NODE_ENV !== "production") {
                console.error("[interpret] unexpected response", json);
            }

        } catch (err) {
            if (process.env.NODE_ENV !== "production") {
                console.error("[interpret] request failed", err);
            }
        }

        if (!interpretResult) {
            if (detectSaveIntent(text)) {
                const fallback = buildProposalsFromChat(
                    text,
                    nextHistory,
                    lastGoodConcepts
                );
                if (fallback.proposals.length > 0) {
                    await applyFallbackProposals(fallback.proposals);
                } else {
                    addAssistantMessage(
                        fallback.followUpText ?? "Ich bin nicht sicher—welches Wort genau?"
                    );
                }
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }
            interpretResult = { kind: "ask" };
        }

        if (interpretResult.kind === "clarify") {
            addAssistantMessage(interpretResult.question);
            setIsSending(false);
            inputRef.current?.focus();
            return;
        }

        if (interpretResult.kind === "save") {
            if (interpretResult.items.length === 0) {
                addAssistantMessage("Ich bin nicht sicher—welches Wort genau?");
            } else {
                await applyProposals(interpretResult.items);
            }

            setIsSending(false);
            inputRef.current?.focus();
            return;
        }

        if (proposals.length > 0) {
            setProposals([]);
        }

        try {
            const r = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ownerKey,
                    message: interpretResult.rewrittenUserMessage || text,
                    context: trainingContext ?? undefined,
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
            updateLastConceptsFromAnswer(String(data.answer));
        } catch {
            setError("KI-Anfrage fehlgeschlagen.");
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    }, [
        input,
        isSending,
        textHistory,
        ownerKey,
        buildInterpretTrainingContext,
        trainingContext,
        lastGoodConcepts,
        applyFallbackProposals,
        addAssistantMessage,
        applyProposals,
        proposals.length,
        updateLastConceptsFromAnswer,
    ]);

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
                                    Training-Kontext wird automatisch berücksichtigt.
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
                                            <div
                                                className={[
                                                    "rounded-xl px-3 py-2 text-sm leading-5",
                                                    m.role === "user"
                                                        ? "self-end bg-accent-secondary text-on-accent"
                                                        : "self-start bg-surface text-primary border border-soft",
                                                ].join(" ")}
                                            >
                                                {m.role === "assistant" ? (
                                                    <div className="flex flex-col gap-2">
                                                        {parseMessageBlocks(m.text).map(
                                                            (block, blockIndex) =>
                                                                block.type === "list" ? (
                                                                    <ul
                                                                        key={`${idx}-list-${blockIndex}`}
                                                                        className="list-disc space-y-1 pl-5"
                                                                    >
                                                                        {block.items.map(
                                                                            (item, itemIndex) => (
                                                                                <li
                                                                                    key={`${idx}-item-${itemIndex}`}
                                                                                    className="text-sm"
                                                                                >
                                                                                    {item}
                                                                                </li>
                                                                            )
                                                                        )}
                                                                    </ul>
                                                                ) : (
                                                                    <p
                                                                        key={`${idx}-p-${blockIndex}`}
                                                                        className="whitespace-pre-wrap"
                                                                    >
                                                                        {block.text}
                                                                    </p>
                                                                )
                                                        )}
                                                    </div>
                                                ) : (
                                                    m.text
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {proposals.length > 0 ? (
                                        <div className="self-start w-full">
                                            <div className="mb-2 text-xs text-muted">
                                                Vorschläge zum Speichern (No auto-save; always confirm)
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                {proposals.map((entry) => (
                                                    <ChatProposal
                                                        key={entry.proposal.id}
                                                        proposal={entry.proposal}
                                                        status={entry.status}
                                                        onUpdate={(update) => {
                                                            const nextFront =
                                                                typeof update.front_text === "string"
                                                                    ? update.front_text
                                                                    : entry.proposal.front_text;
                                                            const nextBack =
                                                                typeof update.back_text === "string"
                                                                    ? update.back_text
                                                                    : entry.proposal.back_text;
                                                            updateProposal(entry.proposal.id, {
                                                                front_text: nextFront,
                                                                back_text: nextBack,
                                                                missing_back:
                                                                    !nextFront.trim() ||
                                                                    !nextBack.trim(),
                                                            });
                                                        }}
                                                        onSave={() =>
                                                            void handleProposalSave(entry.proposal.id)
                                                        }
                                                        onDiscard={() =>
                                                            removeProposal(entry.proposal.id)
                                                        }
                                                        onSwap={() => {
                                                            updateProposal(entry.proposal.id, {
                                                                front_text: entry.proposal.back_text,
                                                                back_text: entry.proposal.front_text,
                                                                missing_back:
                                                                    !entry.proposal.back_text.trim() ||
                                                                    !entry.proposal.front_text.trim(),
                                                            });
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    {isSending ? (
                                        <div className="self-start rounded-xl border border-soft bg-surface px-3 py-2 text-sm text-muted">
                                            <span className="inline-flex animate-pulse tracking-widest">...</span>
                                        </div>
                                    ) : null}
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
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        if (!isSending && input.trim()) {
                                            void send();
                                        }
                                    }
                                }}
                                rows={2}
                                placeholder="Frage eingeben…"
                                className="w-full resize-none rounded-xl border border-soft px-4 py-3 text-base shadow-soft focus:border-accent focus:outline-none"
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
