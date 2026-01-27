"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChatProposal from "@/components/ChatProposal";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { CardProposal, ExplainedConcept } from "@/lib/cards/proposals";
import {
    detectSaveIntent,
    ProposalStatus,
} from "@/lib/cards/proposals";
import {
    canonicalizeToSwDe,
    looksLikeMetaText,
    normalizeText,
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
    | { kind: "save"; items: SaveItem[] }
    | { kind: "clarify"; question: string };

type SaveItem = {
    type: "vocab" | "sentence";
    sw: string;
    de: string;
    source: "chat" | "training" | "user" | "assistant_list";
    confidence: number;
};

type AssistantPair = { type: "vocab" | "sentence"; sw: string; de: string };

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
    // Manual test checklist:
    // 1) Frage nach Liste (Tiere/Berufe/Geräte) -> Antwort + Buffer füllt sich.
    // 2) "speichere Polizist, Bauarbeiter und Arzt" -> 3 Vorschläge, Duplikate markiert.
    // 3) "speichere alle" -> nutzt letzte Antwort, nicht das Wort "alle".
    // 4) Nach Save weiterfragen/speichern möglich.
    // 5) Neue Frage bei offenen Vorschlägen -> Vorschläge schließen.
    // 6) front_lang="sw", back_lang="de" korrekt.
    const [mounted, setMounted] = useState(false);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conceptBuffer, setConceptBuffer] = useState<ExplainedConcept[]>([]);
    const [lastAnswerConcepts, setLastAnswerConcepts] = useState<AssistantPair[]>([]);
    const [proposals, setProposals] = useState<ProposalEntry[]>([]);
    const [isSavingAll, setIsSavingAll] = useState(false);

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

    const addAssistantMessage = useCallback((text: string) => {
        setMessages((prev) => [...prev, { kind: "text", role: "assistant", text }]);
    }, []);

    const appendConceptsToBuffer = useCallback((concepts: ExplainedConcept[]) => {
        if (concepts.length === 0) return;
        setConceptBuffer((prev) => {
            const merged = [...prev, ...concepts];
            const seen = new Set<string>();
            const dedupedNewest: ExplainedConcept[] = [];
            for (let i = merged.length - 1; i >= 0; i -= 1) {
                const concept = merged[i];
                const key = `${normalizeText(concept.sw)}|${normalizeText(concept.de)}`;
                if (!key.trim()) continue;
                if (seen.has(key)) continue;
                seen.add(key);
                dedupedNewest.push(concept);
            }
            return dedupedNewest.reverse().slice(-80);
        });
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
            const filteredItems = items.filter((item) => item.sw.trim() && item.de.trim());
            if (filteredItems.length === 0) {
                addAssistantMessage(
                    "Ich habe kein vollständiges Wortpaar erkannt. Soll ich die Übersetzung automatisch ermitteln?"
                );
                return;
            }
            const entries = await Promise.all(
                filteredItems.map(async (item) => {
                    const canonical = canonicalizeToSwDe({
                        front_lang: "sw",
                        back_lang: "de",
                        front_text: item.sw.trim(),
                        back_text: item.de.trim(),
                    });
                    const proposal: CardProposal = {
                        id: crypto.randomUUID(),
                        type: item.type,
                        front_lang: "sw",
                        back_lang: "de",
                        front_text: canonical.sw,
                        back_text: canonical.de,
                        source_label: item.source,
                    };
                    let status: ProposalStatus = { state: "idle" };
                    const existsResult = await checkDuplicate(canonical.sw, canonical.de);
                    if (existsResult?.exists) {
                        status = {
                            state: "exists",
                            existingId: existsResult.existing_id ?? "",
                        };
                    }
                    return { kind: "proposal" as const, proposal, status };
                })
            );
            const dedupMerge = (
                prev: ProposalEntry[],
                next: ProposalEntry[]
            ): ProposalEntry[] => {
                const keyFor = (entry: ProposalEntry) =>
                    `${entry.proposal.front_text.trim().toLowerCase()}||${entry.proposal.back_text
                        .trim()
                        .toLowerCase()}`;
                const merged = new Map<string, ProposalEntry>();
                prev.forEach((entry) => merged.set(keyFor(entry), entry));
                next.forEach((entry) => {
                    const key = keyFor(entry);
                    if (!merged.has(key)) merged.set(key, entry);
                });
                return Array.from(merged.values());
            };
            setProposals((prev) => dedupMerge(prev, entries));
        },
        [addAssistantMessage, checkDuplicate]
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
        setProposals((prev) => {
            const next = prev.filter((entry) => entry.proposal.id !== id);
            if (next.length === 0) {
                return [];
            }
            return next;
        });
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
                window.setTimeout(() => {
                    removeProposal(proposalId);
                    const remaining = proposalsRef.current.filter(
                        (item) => item.proposal.id !== proposalId
                    );
                    if (remaining.length === 0) {
                        setProposals([]);
                    }
                }, 600);
            } catch {
                setProposalStatus(proposalId, {
                    state: "error",
                    message: "Speichern fehlgeschlagen.",
                });
            }
        },
        [ownerKey, removeProposal, setProposalStatus]
    );

    const handleSaveIntentAskFallback = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            const isListCommand =
                /\b(alle|alles|restlichen?|noch)\b/i.test(trimmed) ||
                /\bdie\s+restlichen\b/i.test(trimmed);
            if (isListCommand && lastAnswerConcepts.length > 0) {
                await applyProposals(
                    lastAnswerConcepts.map((concept) => ({
                        type: concept.type,
                        sw: concept.sw,
                        de: concept.de,
                        source: "assistant_list",
                        confidence: 0.9,
                    }))
                );
                return;
            }

            addAssistantMessage(
                "Ich bin nicht sicher, welche Begriffe du meinst. Nenne die Wörter oder sag „alle aus der letzten Antwort“."
            );
        },
        [addAssistantMessage, applyProposals, lastAnswerConcepts]
    );

    const handleSaveAll = useCallback(async () => {
        if (isSavingAll) return;
        setIsSavingAll(true);
        const current = proposalsRef.current;
        for (const entry of current) {
            if (entry.status.state === "exists" || entry.status.state === "error") continue;
            if (entry.status.state === "saved" || entry.status.state === "saving") continue;
            await handleProposalSave(entry.proposal.id);
        }
        setIsSavingAll(false);
    }, [handleProposalSave, isSavingAll]);

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

        const isSaveIntent = detectSaveIntent(text);
        const interpretPayload = {
            ownerKey,
            userMessage: text,
            chatHistory: nextHistory.slice(-6),
            trainingContext: buildInterpretTrainingContext(trainingContext),
            lastAnswerConcepts,
            conceptBuffer: conceptBuffer.slice(-30).map((concept) => ({
                type: concept.type,
                sw: concept.sw,
                de: concept.de,
            })),
        };

        let interpretResult: InterpretResult | null = null;

        try {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 6000);
            try {
                const res = await fetch("/api/ai/interpret", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(interpretPayload),
                    signal: controller.signal,
                });

                const json = await res.json().catch(() => null);
                if (res.ok && json?.kind) {
                    interpretResult = json as InterpretResult;
                } else if (process.env.NODE_ENV !== "production") {
                    console.error("[interpret] unexpected response", json);
                }
            } finally {
                window.clearTimeout(timeoutId);
            }
        } catch (err) {
            if (process.env.NODE_ENV !== "production") {
                console.error("[interpret] request failed", err);
            }
        }

        if (!interpretResult) {
            if (isSaveIntent) {
                await handleSaveIntentAskFallback(text);
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

        if (isSaveIntent) {
            await handleSaveIntentAskFallback(text);
            setIsSending(false);
            inputRef.current?.focus();
            return;
        }

        setProposals([]);

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

            if (!r.ok || !data?.answerText) {
                setError("KI-Anfrage fehlgeschlagen.");
                return;
            }

            addAssistantMessage(String(data.answerText));
            if (Array.isArray(data.explainedConcepts) && data.explainedConcepts.length > 0) {
                const mapped = data.explainedConcepts as ExplainedConcept[];
                setLastAnswerConcepts(
                    mapped.map((concept) => ({
                        type: concept.type,
                        sw: concept.sw,
                        de: concept.de,
                    }))
                );
                appendConceptsToBuffer(mapped);
            } else {
                setLastAnswerConcepts([]);
            }
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
        addAssistantMessage,
        applyProposals,
        lastAnswerConcepts,
        conceptBuffer,
        appendConceptsToBuffer,
        handleSaveIntentAskFallback,
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
                                            {proposals.length > 1 ? (
                                                <div className="mb-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleSaveAll()}
                                                        disabled={isSavingAll}
                                                        className="rounded-lg border border-soft bg-surface px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-60"
                                                    >
                                                        {isSavingAll ? "Speichere…" : "✅ Alle speichern"}
                                                    </button>
                                                </div>
                                            ) : null}
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
