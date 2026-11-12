"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import FullScreenSheet from "@/components/FullScreenSheet";
import CardText from "@/components/ui/CardText";
import { NotePreview } from "@/components/trainer/NoteEditor";
import SentenceExplanationContent from "@/components/trainer/SentenceExplanationContent";
import WordUnderstandingFeature from "@/components/trainer/WordUnderstandingFeature";
import { SentenceFeatureIcon } from "@/components/trainer/SentenceFormDisclosure";
import type { TrainerLibraryCard } from "@/lib/trainer/useTrainerCardLibrary";
import type { WordEnrichment } from "@/lib/word/understanding";
import { parseSentenceExplanation } from "@/lib/sentence/explanation";
import { resolveGroupColor } from "@/lib/groups/colors";

const IMAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;
const AUDIO_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-audio`;

export type DetailReturn = { card: TrainerLibraryCard; note: string | null };

export default function CardDetailSheet({ card, initialNote = null, onClose, onEdit, onWordUnderstandingSaved }: {
    card: TrainerLibraryCard | null;
    initialNote?: string | null;
    onClose: () => void;
    onEdit: (card: TrainerLibraryCard, note: string | null) => void;
    onWordUnderstandingSaved?: (cardId: string, enrichment: WordEnrichment) => void;
}) {
    const [detail, setDetail] = useState<TrainerLibraryCard | null>(card);
    const [note, setNote] = useState<string | null>(initialNote);
    const [loading, setLoading] = useState(card?.note_preview === undefined);
    const [playing, setPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const cardId = card ? String(card.id) : null;
    const hasInitialNote = card?.note_preview !== undefined;

    useEffect(() => {
        if (!cardId) return;
        const controller = new AbortController();
        void fetch(`/api/cards?id=${encodeURIComponent(cardId)}`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => response.ok ? response.json() : null).catch(() => null).then(async (cardBody) => {
            if (controller.signal.aborted) return;
            if (cardBody?.card) {
                setDetail(cardBody.card);
                if (cardBody.card.note_preview !== undefined) setNote(cardBody.card.note_preview?.main_notes ?? null);
            }
            if (cardBody?.card?.note_preview === undefined && !hasInitialNote) {
                const noteBody = await fetch(`/api/cards/notes?cardId=${encodeURIComponent(cardId)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => response.ok ? response.json() : null).catch(() => null);
                if (controller.signal.aborted) return;
                setNote(noteBody?.note?.main_notes ?? null);
            }
            setLoading(false);
        });
        return () => controller.abort();
    }, [cardId, hasInitialNote]);

    const shown = detail ?? card;
    const sentence = shown?.type === "sentence";
    const explanation = parseSentenceExplanation(shown?.sentence_explanation);

    return <FullScreenSheet open={Boolean(card)} title={sentence ? "Satz ansehen" : "Karte ansehen"} presentation="card-detail" onClose={onClose}>
        {loading ? <div className="card-detail-loading" role="status">Karte wird geladen …</div> : shown ? <div className={`card-detail ${!shown.image_path && !sentence ? "without-image" : ""}`} data-testid="card-detail" data-card-kind={sentence ? "sentence" : "vocab"}>
            <div className="card-detail-topline">
                <span className="card-detail-eyebrow">{sentence ? "Dein Lernsatz" : "Deine Lernkarte"}</span>
                <button type="button" className="card-detail-edit" onClick={() => onEdit(shown, note)}>Bearbeiten</button>
            </div>
            <article className={`card-detail-card ${shown.image_path ? "has-image" : ""}`}>
                <div className="card-detail-hero">
                    <div className="card-detail-copy">
                        <div className="card-detail-term"><span className="card-detail-language">DE</span><h2 className="card-detail-german"><CardText as="span">{shown.german_text}</CardText></h2></div>
                        <div className="card-detail-term card-detail-term--sw"><span className="card-detail-language">SW</span><div className="card-detail-swahili-row">
                            <CardText as="p" className="card-detail-swahili">{shown.swahili_text}</CardText>
                            {shown.audio_path ? <>
                                <button type="button" className={`card-detail-audio ${playing ? "is-playing" : ""}`} onClick={() => { const audio = audioRef.current; if (audio) { audio.currentTime = 0; void audio.play().catch(() => setPlaying(false)); } }} aria-label="Aussprache abspielen" title="Aussprache abspielen" aria-pressed={playing}><SentenceFeatureIcon name="audio" className="h-5 w-5" /></button>
                                <audio ref={audioRef} src={`${AUDIO_BASE_URL}/${shown.audio_path}`} preload="none" hidden onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setPlaying(false)} />
                            </> : null}
                        </div></div>
                    </div>
                    {shown.image_path ? <div className="card-detail-art"><Image src={`${IMAGE_BASE_URL}/${shown.image_path}`} alt={`Illustration zu ${shown.swahili_text ?? "dieser Karte"}`} width={480} height={480} unoptimized className="card-detail-image" /></div> : null}
                    {shown.groups?.length ? <div className="card-detail-meta" aria-label="Gruppen"><div className="card-detail-groups">{shown.groups.map((group) => <span key={group.id}><i className="card-detail-group-dot" style={{ backgroundColor: resolveGroupColor(group.color).hex }} aria-hidden="true" />{group.name}</span>)}</div></div> : null}
                    {note?.trim() ? <aside className="card-detail-note"><SentenceFeatureIcon name="notes" className="h-4 w-4" /><div><span className="card-detail-note-label">Notiz</span><NotePreview value={note} /></div></aside> : null}
                </div>
            {(!sentence || explanation) ? <div className="card-detail-bottom">
                {!sentence ? <section className="card-detail-learning" aria-label="Wort verstehen"><div className="card-detail-learning-heading"><SentenceFeatureIcon name="grammar" className="h-4 w-4" /><h3>Wort verstehen</h3></div>
                    <WordUnderstandingFeature key={String(shown.id)} cardId={String(shown.id)} swahili={shown.swahili_text ?? ""} german={shown.german_text ?? ""} initialEnrichment={shown.word_enrichment} embedded detailPresentation allowRegenerate={false} onSaved={(id, enrichment) => { setDetail((current) => current && String(current.id) === id ? { ...current, word_enrichment: enrichment } : current); onWordUnderstandingSaved?.(id, enrichment); }} />
                </section> : explanation ? <section className="card-detail-learning" aria-label="Satz verstehen"><SentenceExplanationContent explanation={explanation} compact /></section> : null}
            </div> : null}
            </article>
        </div> : null}
    </FullScreenSheet>;
}
