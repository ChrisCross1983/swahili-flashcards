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
    isCleanCandidate,
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
    context?: { enabled: boolean; payload?: any };
};

type TextMessage = {
    kind: "text";
    role: "user" | "assistant";
    text: string;
};

type Msg = TextMessage;

export default function GlobalAiChat({ ownerKey, open, onClose, context }: Props) {
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

    const inputRef = useRef<HTMLTextAreaElement | null>(null);
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

    useEffect(() => {
        if (draftStatus.state !== "saved") return;
        const timeout = window.setTimeout(() => {
            setActiveDraft(null);
            setDraftStatus({ state: "idle" });
        }, 600);
        return () => window.clearTimeout(timeout);
    }, [draftStatus.state]);

    const updateLastConceptsFromAnswer = useCallback((answer: string) => {
        const concepts = extractConceptsFromAssistantText(answer, "answer");
        if (concepts.length > 0) {
            setLastGoodConcepts((prev) => [...prev, ...concepts].slice(-3));
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

    useEffect(() => {
        if (!activeDraft) return;
        if (draftStatus.state === "saving" || draftStatus.state === "saved") return;
        const sw = activeDraft.sw.trim();
        const de = activeDraft.de.trim();
        if (!sw || !de) {
            if (draftStatus.state === "exists") {
                setDraftStatus({ state: "idle" });
            }
            return;
        }

        const controller = new AbortController();
        const checkDuplicates = async () => {
            try {
                const res = await fetch("/api/cards/exists", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: controller.signal,
                    body: JSON.stringify({
                        ownerKey,
                        sw,
                        de,
                    }),
                });

                const json = await res.json().catch(() => ({}));
                if (!res.ok) return;
                if (json.exists) {
                    setDraftStatus({
                        state: "exists",
                        existingId: json.existing_id ?? "",
                    });
                } else if (draftStatus.state === "exists") {
                    setDraftStatus({ state: "idle" });
                }
            } catch {
                // ignore
            }
        };

        void checkDuplicates();
        return () => controller.abort();
    }, [activeDraft, draftStatus.state, ownerKey]);

    const addAssistantMessage = useCallback((text: string) => {
        setMessages((prev) => [...prev, { kind: "text", role: "assistant", text }]);
    }, []);

    const translateCandidate = useCallback(
        async (candidate: string, sourceLang: "sw" | "de") => {
            const res = await fetch("/api/ai/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ownerKey,
                    text: candidate,
                    sourceLang,
                }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) return null;
            const sw = typeof json.sw === "string" ? json.sw.trim() : "";
            const de = typeof json.de === "string" ? json.de.trim() : "";
            if (!sw || !de) return null;
            return { sw, de };
        },
        [ownerKey]
    );

    const handleDraftSave = useCallback(async () => {
        if (!activeDraft) return;
        if (draftStatus.state === "exists") return;
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
    }, [activeDraft, draftStatus.state, ownerKey]);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || isSending) return;

        setIsSending(true);
        setError(null);

        setMessages((prev) => [...prev, { kind: "text", role: "user", text }]);
        setInput("");

        if (activeDraft && draftStatus.state !== "exists") {
            setActiveDraft(null);
            setDraftStatus({ state: "idle" });
        }

        if (detectSaveIntent(text)) {
            const candidate = extractCandidateFromUser(text);
            const normalizedCandidate = candidate ? normalizeText(candidate) : "";

            if (candidate && !isCleanCandidate(candidate)) {
                addAssistantMessage("Welches genaue Wort soll ich speichern?");
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

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

            if (!candidate) {
                if (matchesImplicitReference(text)) {
                    addAssistantMessage("Welches Wort meinst du genau?");
                } else {
                    addAssistantMessage("Welches Wort soll ich speichern?");
                }
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

            if (looksLikeMetaText(candidate)) {
                addAssistantMessage("Bitte nur das Wort oder die kurze Phrase angeben.");
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

            const wordCount = candidate.split(/\s+/).filter(Boolean).length;
            if (candidate.length > 40 || wordCount > 3) {
                addAssistantMessage("Zu lang – welches kurze Wort oder welche kurze Phrase meinst du?");
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

            const guessed = guessLang(candidate);
            const translation = await translateCandidate(candidate, guessed);
            if (!translation) {
                addAssistantMessage("Ich brauche die Übersetzung dazu. Kannst du sie angeben?");
                setIsSending(false);
                inputRef.current?.focus();
                return;
            }

            setDraftFromValues({
                type: looksLikeSentence(candidate) ? "sentence" : "vocab",
                sw: translation.sw,
                de: translation.de,
                missing_de: false,
                source: "manual",
                status: "awaiting_confirmation",
                sourceSnippet: "AI_TRANSLATION",
                notes: "KI-Vorschlag – bitte prüfen",
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
                    context: context?.enabled ? context.payload : undefined,
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
        draftStatus.state,
        addAssistantMessage,
        setDraftFromValues,
        handleDraftSave,
        context,
        translateCandidate,
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
            notes: activeDraft.notes,
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
