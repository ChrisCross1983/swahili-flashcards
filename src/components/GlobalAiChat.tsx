"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChatProposal from "@/components/ChatProposal";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { CardProposal } from "@/lib/cards/proposals";
import {
    detectSaveIntent,
    extractCandidateFromUser,
    extractConceptsFromAssistantText,
    findPairInAssistantHistory,
    guessLang,
    LastExplainedConcept,
    looksLikeSentence,
    matchesImplicitReference,
    ProposalStatus,
} from "@/lib/cards/proposals";
import {
    ActiveSaveDraft,
    canonicalizeToSwDe,
    looksLikeMetaText,
    normalizeText,
} from "@/lib/cards/saveFlow";

type Props = {
    ownerKey: string;
    open: boolean;
    onClose: () => void;
};

type TextMessage = {
    kind: "text";
    role: "user" | "assistant";
    text: string;
};

type Msg = TextMessage;

export default function GlobalAiChat({ ownerKey, open, onClose }: Props) {
    const [mounted, setMounted] = useState(false);
    const [messages, setMessages] = useState<TextMessage[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastGoodConcepts, setLastGoodConcepts] = useState<LastExplainedConcept[]>(
        []
    );
    const [activeDraft, setActiveDraft] = useState<ActiveSaveDraft | null>(null);
    const [draftStatus, setDraftStatus] = useState<ProposalStatus>({ state: "idle" });

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

    const updateLastConceptsFromAnswer = useCallback((answer: string) => {
        const concepts = extractConceptsFromAssistantText(answer, "answer");
        if (concepts.length > 0) {
            setLastGoodConcepts(concepts);
        }
    }, []);

    const sanitizeDraftValue = useCallback((value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (looksLikeMetaText(trimmed)) return "";
        return trimmed;
    }, []);

    const createDraft = useCallback(
        (draft: Omit<ActiveSaveDraft, "id" | "detectedAt">) => {
            const next: ActiveSaveDraft = {
                ...draft,
                id: crypto.randomUUID(),
                detectedAt: Date.now(),
            };
            setActiveDraft(next);
            setDraftStatus({ state: "idle" });
            return next;
        },
        []
    );

    const setDraftFromValues = useCallback(
        (draft: Omit<ActiveSaveDraft, "id" | "detectedAt">) => {
            const sanitizedSw = sanitizeDraftValue(draft.sw);
            const sanitizedDe = sanitizeDraftValue(draft.de);
            const missing = !sanitizedSw || !sanitizedDe;
            return createDraft({
                ...draft,
                sw: sanitizedSw,
                de: sanitizedDe,
                missing_de: missing,
                status: missing ? "draft" : draft.status,
                type: looksLikeSentence(sanitizedSw || sanitizedDe) ? "sentence" : "vocab",
            });
        },
        [createDraft, sanitizeDraftValue]
    );

    const addAssistantMessage = useCallback((text: string) => {
        setMessages((prev) => [...prev, { kind: "text", role: "assistant", text }]);
    }, []);

    const handleDraftSave = useCallback(async () => {
        if (!activeDraft) return;
        const sw = activeDraft.sw.trim();
        const de = activeDraft.de.trim();
        if (!sw || !de) {
            setDraftStatus({
                state: "error",
                message: "Bitte beide Seiten ergänzen, bevor gespeichert wird.",
            });
            return;
        }
        if (looksLikeMetaText(sw) || looksLikeMetaText(de)) {
            setDraftStatus({
                state: "error",
                message: "Bitte nur das Wortpaar speichern, kein Hinweistext.",
            });
            return;
        }

        setDraftStatus({ state: "saving" });
        const canonical = canonicalizeToSwDe({
            front_lang: "sw",
            back_lang: "de",
            front_text: sw,
            back_text: de,
        });

        try {
            const res = await fetch("/api/cards/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ownerKey,
                    type: activeDraft.type,
                    front_text: canonical.sw,
                    back_text: canonical.de,
                    front_lang: "sw",
                    back_lang: "de",
                    source: "chat",
                    context: activeDraft.sourceSnippet ?? null,
                }),
            });

            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
                setDraftStatus({
                    state: "error",
                    message: json?.error ?? "Speichern fehlgeschlagen.",
                });
                return;
            }

            if (json.status === "exists") {
                setDraftStatus({
                    state: "exists",
                    existingId: json.existing_id,
                });
                return;
            }

            setDraftStatus({ state: "saved", id: json.id });
        } catch {
            setDraftStatus({
                state: "error",
                message: "Speichern fehlgeschlagen.",
            });
        }
    }, [activeDraft, ownerKey]);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || isSending) return;

        setIsSending(true);
        setError(null);

        setMessages((prev) => [...prev, { kind: "text", role: "user", text }]);
        setInput("");

        if (activeDraft) {
            const lowered = text.toLowerCase();
            if (/(abbrechen|verwerfen|doch nicht|nicht speichern)/i.test(lowered)) {
                setActiveDraft(null);
                setDraftStatus({ state: "idle" });
                addAssistantMessage("Alles klar, verworfen.");
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

            if (/(tausch|swap|wechsel)/i.test(lowered)) {
                setActiveDraft((prev) => {
                    if (!prev) return prev;
                    const next = {
                        ...prev,
                        sw: prev.de,
                        de: prev.sw,
                    };
                    return {
                        ...next,
                        missing_de: !next.sw.trim() || !next.de.trim(),
                    };
                });
                setDraftStatus({ state: "idle" });
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

            if (!detectSaveIntent(text)) {
                let followUpText: string | null = null;
                const pairMatch = text.match(/(.+?)\s*[-–—:]\s*(.+)$/);
                if (pairMatch) {
                    const left = pairMatch[1].trim();
                    const right = pairMatch[2].trim();
                    const leftLang = guessLang(left);
                    const rightLang = guessLang(right);
                    const swCandidate = leftLang === "sw" && rightLang === "de" ? left : right;
                    const deCandidate = leftLang === "sw" && rightLang === "de" ? right : left;
                    setActiveDraft((prev) => {
                        if (!prev) return prev;
                        const nextSw = sanitizeDraftValue(swCandidate || prev.sw);
                        const nextDe = sanitizeDraftValue(deCandidate || prev.de);
                        const missing = !nextSw || !nextDe;
                        return {
                            ...prev,
                            sw: nextSw,
                            de: nextDe,
                            missing_de: missing,
                            status: missing ? "draft" : "awaiting_confirmation",
                        };
                    });
                } else {
                    if (activeDraft) {
                        const cleaned = sanitizeDraftValue(text);
                        let updatedSw = activeDraft.sw;
                        let updatedDe = activeDraft.de;
                        if (!updatedSw.trim() && !updatedDe.trim()) {
                            const guessed = guessLang(cleaned);
                            if (guessed === "sw") {
                                updatedSw = cleaned;
                            } else {
                                updatedDe = cleaned;
                            }
                        } else if (!updatedSw.trim()) {
                            updatedSw = cleaned;
                        } else if (!updatedDe.trim()) {
                            updatedDe = cleaned;
                        }
                        const missing = !updatedSw.trim() || !updatedDe.trim();
                        setActiveDraft({
                            ...activeDraft,
                            sw: updatedSw,
                            de: updatedDe,
                            missing_de: missing,
                            status: missing ? "draft" : "awaiting_confirmation",
                        });

                        if (!updatedSw && !updatedDe) {
                            followUpText =
                                "Ist das Wort deutsch oder swahili? (oder gib beide Seiten an)";
                        } else if (updatedSw && !updatedDe) {
                            followUpText = `Was bedeutet „${updatedSw}“ auf Deutsch?`;
                        } else if (!updatedSw && updatedDe) {
                            followUpText = `Wie lautet das swahilische Wort für „${updatedDe}“?`;
                        }
                    }
                }
                if (followUpText) {
                    addAssistantMessage(followUpText);
                }
            }

            setIsSending(false);
            inputRef.current?.focus();
            return;
        }

        if (detectSaveIntent(text)) {
            const candidate = extractCandidateFromUser(text);
            const normalizedCandidate = candidate ? normalizeText(candidate) : "";

            const referencedConcept = lastGoodConcepts.find((concept) => {
                const swNorm = normalizeText(concept.sw);
                const deNorm = normalizeText(concept.de);
                if (normalizedCandidate && swNorm.includes(normalizedCandidate)) return true;
                if (normalizedCandidate && deNorm.includes(normalizedCandidate)) return true;
                return false;
            });

            if (referencedConcept) {
                setDraftFromValues({
                    type: looksLikeSentence(referencedConcept.sw) ? "sentence" : "vocab",
                    sw: referencedConcept.sw,
                    de: referencedConcept.de,
                    missing_de: false,
                    source: "last_list",
                    status: "awaiting_confirmation",
                    sourceSnippet: undefined,
                });
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

            if (!candidate && lastGoodConcepts.length > 0 && matchesImplicitReference(text)) {
                const latest = lastGoodConcepts[lastGoodConcepts.length - 1];
                setDraftFromValues({
                    type: looksLikeSentence(latest.sw) ? "sentence" : "vocab",
                    sw: latest.sw,
                    de: latest.de,
                    missing_de: false,
                    source: "last_list",
                    status: "awaiting_confirmation",
                    sourceSnippet: undefined,
                });
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

            if (candidate) {
                const fromContext = findPairInAssistantHistory(candidate, textHistory);
                if (fromContext) {
                    setDraftFromValues({
                        type: looksLikeSentence(fromContext.sw) ? "sentence" : "vocab",
                        sw: fromContext.sw,
                        de: fromContext.de,
                        missing_de: false,
                        source: "chat_context",
                        status: "awaiting_confirmation",
                        sourceSnippet: fromContext.snippet.slice(0, 240),
                    });
                    setIsSending(false);
                    inputRef.current?.focus();
                    return;
                }
            }

            if (candidate && !looksLikeMetaText(candidate)) {
                const guessed = guessLang(candidate);
                const swCandidate = guessed === "sw" ? candidate : "";
                const deCandidate = guessed === "de" ? candidate : "";
                setDraftFromValues({
                    type: looksLikeSentence(candidate) ? "sentence" : "vocab",
                    sw: swCandidate,
                    de: deCandidate,
                    missing_de: true,
                    source: "manual",
                    status: "draft",
                    sourceSnippet: undefined,
                });
                if (swCandidate) {
                    addAssistantMessage(`Was bedeutet „${swCandidate}“ auf Deutsch?`);
                } else if (deCandidate) {
                    addAssistantMessage(`Wie lautet das swahilische Wort für „${deCandidate}“?`);
                } else {
                    addAssistantMessage(
                        "Ist das Wort deutsch oder swahili? (oder gib beide Seiten an)"
                    );
                }
            } else {
                setDraftFromValues({
                    type: "vocab",
                    sw: "",
                    de: "",
                    missing_de: true,
                    source: "manual",
                    status: "draft",
                    sourceSnippet: undefined,
                });
                addAssistantMessage("Welches Wort soll ich speichern?");
            }

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
        lastGoodConcepts,
        ownerKey,
        textHistory,
        updateLastConceptsFromAnswer,
        activeDraft,
        addAssistantMessage,
        sanitizeDraftValue,
        setDraftFromValues,
    ]);

    const draftProposal: CardProposal | null = activeDraft
        ? {
            id: activeDraft.id,
            type: activeDraft.type,
            front_lang: "sw",
            back_lang: "de",
            front_text: activeDraft.sw,
            back_text: activeDraft.de,
            missing_back: !activeDraft.sw.trim() || !activeDraft.de.trim(),
            source_context_snippet: activeDraft.sourceSnippet,
            source_label: activeDraft.source,
        }
        : null;

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
                                        </div>
                                    ))}
                                    {draftProposal ? (
                                        <div className="self-start w-full">
                                            <div className="mb-2 text-xs text-muted">
                                                Vorschlag zum Speichern (No auto-save; always confirm)
                                            </div>
                                            <ChatProposal
                                                proposal={draftProposal}
                                                status={draftStatus}
                                                onUpdate={(update) => {
                                                    setActiveDraft((prev) => {
                                                        if (!prev) return prev;
                                                        const nextSw =
                                                            typeof update.front_text === "string"
                                                                ? update.front_text
                                                                : prev.sw;
                                                        const nextDe =
                                                            typeof update.back_text === "string"
                                                                ? update.back_text
                                                                : prev.de;
                                                        const missing = !nextSw.trim() || !nextDe.trim();
                                                        return {
                                                            ...prev,
                                                            sw: nextSw,
                                                            de: nextDe,
                                                            missing_de: missing,
                                                            status: missing
                                                                ? "draft"
                                                                : "awaiting_confirmation",
                                                        };
                                                    });
                                                    setDraftStatus({ state: "idle" });
                                                }}
                                                onSave={() => void handleDraftSave()}
                                                onDiscard={() => {
                                                    setActiveDraft(null);
                                                    setDraftStatus({ state: "idle" });
                                                }}
                                                onSwap={() => {
                                                    setActiveDraft((prev) => {
                                                        if (!prev) return prev;
                                                        const next = {
                                                            ...prev,
                                                            sw: prev.de,
                                                            de: prev.sw,
                                                        };
                                                        return {
                                                            ...next,
                                                            missing_de:
                                                                !next.sw.trim() || !next.de.trim(),
                                                        };
                                                    });
                                                    setDraftStatus({ state: "idle" });
                                                }}
                                            />
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
