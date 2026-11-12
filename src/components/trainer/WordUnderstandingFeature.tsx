"use client";

import { useEffect, useRef, useState } from "react";
import { beginnerWordHint, concordChange, hasWordUnderstanding, ingiForms, isIngiForm, nounClassLabel, nounSentenceChange, wordTypeLabel, type WordEnrichment } from "@/lib/word/understanding";

function HighlightedSentence({ sentence, forms }: { sentence: string; forms: string[] }) {
    const words = [...new Set(forms.map((form) => form.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!words.length) return <>{sentence}</>;
    const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu");
    return <>{sentence.split(pattern).map((part, index) => words.some((word) => word.toLocaleLowerCase() === part.toLocaleLowerCase())
        ? <strong className="word-understanding-highlight" key={index}>{part}</strong> : part)}</>;
}

export function WordUnderstandingContent({ enrichment, swahili, german }: { enrichment: WordEnrichment; swahili: string; german: string }) {
    const word = swahili.trim();
    const ingi = isIngiForm(word);
    const noun = enrichment.pos === "noun" && !ingi;
    const nounClass = noun || enrichment.pos === "adj" ? nounClassLabel(enrichment.noun_class) : null;
    const phrase = enrichment.pos === "phrase";
    const knownPhrase = phrase && word.toLocaleLowerCase() === "habari za asubuhi";
    const stem = enrichment.pos === "verb" && /^(?:ku|kw)[a-z]+$/i.test(word) ? `-${word.slice(2)}` : null;
    const agreement = noun ? concordChange(enrichment.notes) : null;
    const sentenceChange = noun ? nounSentenceChange(enrichment) : null;
    const note = beginnerWordHint(enrichment.notes, sentenceChange?.changed);
    const examples = [...enrichment.examples].sort((a, b) => Number(b.sw.toLocaleLowerCase().includes(word.toLocaleLowerCase())) - Number(a.sw.toLocaleLowerCase().includes(word.toLocaleLowerCase()))).slice(0, 2);
    if (ingi && word.toLocaleLowerCase() === "nyingi" && !examples.some((example) => /\bnyingi\b/i.test(example.sw))) {
        examples.unshift({ sw: "Kuna nyumba nyingi hapa.", de: "Hier gibt es viele Häuser." });
        examples.length = 2;
    }
    const highlights = ingi ? ingiForms.map(({ form }) => form) : [word, enrichment.singular ?? "", enrichment.plural ?? "", stem?.slice(1) ?? ""];
    const showNote = note && !ingi && !knownPhrase && !(agreement && sentenceChange) && !(enrichment.pos === "verb" && /\bni-|\-na-/i.test(note));
    const mnemonic = enrichment.mnemonic?.trim();
    const showMnemonic = mnemonic && mnemonic.length <= 80 && /präfix|klasse|stamm|plural|kontext/i.test(mnemonic) && !/klingt|reimt|erinnert/i.test(mnemonic);
    return <div className="word-understanding-content" data-testid="word-understanding-content">
        <div className="word-understanding-main">
            {nounClass && !ingi ? <span className="word-understanding-class">{nounClass}</span> : !noun && !ingi ? <span className="word-understanding-type">{wordTypeLabel(enrichment.pos)}</span> : null}
            {ingi ? <p><strong>{word}</strong> kommt von <strong>-ingi</strong> <span className="text-muted">= {german || "viel / viele"}</span></p>
                : noun && enrichment.singular && enrichment.plural ? <p className="word-understanding-form"><strong>{enrichment.singular}</strong><span aria-hidden="true"> → </span><strong>{enrichment.plural}</strong>{agreement && sentenceChange ? <small>{agreement}</small> : null}</p>
                    : <p><strong>{word}</strong>{german ? <span className="text-muted"> · {german}</span> : null}</p>}
        </div>
        {ingi ? <div className="word-understanding-pattern" aria-label="Formen nach Nomenklasse">{ingiForms.map(({ noun: exampleNoun, form, nounClass: label }) =>
            <div key={form} className={form === word.toLocaleLowerCase() ? "is-current" : ""}><span>{exampleNoun} <span aria-hidden="true">→</span> <strong>{form}</strong></span><small>{label}</small></div>)}</div> : null}
        {noun && agreement && !sentenceChange ? <p className="word-understanding-agreement"><strong>{agreement}</strong><span>Auch das Verb ändert sich im Plural.</span></p> : null}
        {enrichment.pos === "verb" && stem ? <div className="word-understanding-pattern word-understanding-markers"><span>Stamm <strong>{stem}</strong></span>
            {/\bni-/i.test(enrichment.notes ?? "") ? <span><strong>ni-</strong> ich</span> : null}
            {/-na-/i.test(enrichment.notes ?? "") ? <span><strong>-na-</strong> Präsens</span> : null}</div> : null}
        {phrase ? <div className="word-understanding-parts">{knownPhrase ? <>
            <span><strong>habari</strong> · Nachricht / Befinden</span><span><strong>za</strong> · Verbindung zu Klasse 10</span><span><strong>asubuhi</strong> · Morgen</span>
        </> : word.split(/\s+/).map((part, index) => <strong key={`${part}-${index}`}>{part}</strong>)}</div> : null}
        {sentenceChange ? <div className="word-understanding-examples word-understanding-sentence-change">
            <span className="word-understanding-example-label">So verändert sich der Satz</span>
            <div><p lang="sw"><HighlightedSentence sentence={sentenceChange.singular.sw} forms={sentenceChange.changed.map((pair) => pair.from)} /></p><p lang="de">{sentenceChange.singular.de}</p></div>
            <span className="word-understanding-plural">↓ Plural</span>
            <div><p lang="sw"><HighlightedSentence sentence={sentenceChange.plural.sw} forms={sentenceChange.changed.map((pair) => pair.to)} /></p><p lang="de">{sentenceChange.plural.de}</p></div>
        </div> : examples.length ? <div className="word-understanding-examples">{examples.map((example, index) => <div key={`${index}-${example.sw}`}>
            <p lang="sw"><HighlightedSentence sentence={example.sw} forms={highlights} /></p><p lang="de">{example.de}</p>
        </div>)}</div> : null}
        {knownPhrase ? <p className="word-understanding-hint">Sinngemäß: Wie sind die Nachrichten des Morgens?</p> : showNote ? <p className="word-understanding-hint">{note}</p> : null}
        {showMnemonic ? <p className="word-understanding-tip"><span>Merktipp</span> {mnemonic}</p> : null}
    </div>;
}

export default function WordUnderstandingFeature({ cardId, swahili, german, initialEnrichment, onSaved, onChange, embedded = false, enabled = true, allowRegenerate = true, detailPresentation = false }: {
    cardId: string;
    swahili: string;
    german: string;
    initialEnrichment?: WordEnrichment | null;
    onSaved: (cardId: string, enrichment: WordEnrichment) => void;
    onChange?: (enrichment: WordEnrichment | null) => void;
    embedded?: boolean;
    enabled?: boolean;
    allowRegenerate?: boolean;
    detailPresentation?: boolean;
}) {
    const active = useRef(true);
    const lock = useRef(false);
    const onChangeRef = useRef(onChange);
    const [enrichment, setEnrichment] = useState<WordEnrichment | null>(initialEnrichment ?? null);
    const [loading, setLoading] = useState(!initialEnrichment);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState(false);
    const [open, setOpen] = useState(false);
    const [saved, setSaved] = useState(false);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

    useEffect(() => {
        if (!saved) return;
        const timer = window.setTimeout(() => setSaved(false), 2500);
        return () => window.clearTimeout(timer);
    }, [saved]);

    useEffect(() => {
        active.current = true;
        if (!enabled) return () => { active.current = false; };
        if (initialEnrichment) return () => { active.current = false; };
        const controller = new AbortController();
        void fetch(`/api/cards/word-explanation?cardId=${encodeURIComponent(cardId)}`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => response.ok ? response.json() : null)
            .then((body) => { if (active.current) { setEnrichment(body?.enrichment ?? null); onChangeRef.current?.(body?.enrichment ?? null); } })
            .catch(() => { /* The POST action rechecks ownership and saved enrichment. */ })
            .finally(() => { if (active.current) setLoading(false); });
        return () => { active.current = false; controller.abort(); };
    }, [cardId, initialEnrichment, enabled]);

    async function generate(regenerate = false) {
        if (lock.current) return;
        lock.current = true;
        setGenerating(true);
        setError(false);
        setSaved(false);
        try {
            const response = await fetch("/api/cards/word-explanation", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId, regenerate }),
            });
            const body = await response.json().catch(() => ({}));
            const result = body.enrichment as WordEnrichment | undefined;
            if (!response.ok || !result || !hasWordUnderstanding(result)) throw new Error("generation_failed");
            onSaved(cardId, result);
            if (active.current) { setEnrichment(result); onChangeRef.current?.(result); setOpen(true); setSaved(!body.reused); }
        } catch { if (active.current) setError(true); }
        finally { lock.current = false; if (active.current) setGenerating(false); }
    }

    if (loading) return <div className="trainer-learning-loading" role="status">Wortwissen wird geladen …</div>;
    if (embedded) return <div className={`word-understanding-form-panel ${detailPresentation ? "word-understanding-detail-panel" : ""}`} aria-label="Wort verstehen">
        {enrichment && hasWordUnderstanding(enrichment) ? <>
            <WordUnderstandingContent enrichment={enrichment} swahili={swahili} german={german} />
            {allowRegenerate ? <button type="button" className="btn btn-ghost word-understanding-regenerate" disabled={generating} onClick={() => void generate(true)}>{generating ? "Worterklärung wird erstellt …" : "Neu erzeugen"}</button> : null}
        </> : <>
            <p className="text-sm text-muted">{detailPresentation ? "Noch keine Worterklärung vorhanden." : "Klasse, Formen und Verwendung dieses Wortes verstehen."}</p>
            <button type="button" className={detailPresentation ? "card-detail-generate" : "btn btn-secondary mt-3 min-h-11"} disabled={generating} onClick={() => void generate()}>{detailPresentation && !generating ? <span aria-hidden="true">＋</span> : null}{generating ? "Worterklärung wird erstellt …" : error ? "Erneut versuchen" : "Worterklärung erzeugen"}</button>
        </>}
        {error ? <p role="alert" className="mt-2 text-sm">Die Worterklärung konnte gerade nicht erstellt werden.</p> : null}
        {saved ? <p role="status" className="mt-2 text-xs text-emerald-700">Worterklärung gespeichert</p> : null}
    </div>;
    if (enrichment && hasWordUnderstanding(enrichment)) return <section className="word-understanding-disclosure" aria-label="Wort verstehen">
        <button type="button" className="word-understanding-toggle" aria-expanded={open} aria-controls={`word-understanding-${cardId}`} onClick={() => setOpen((value) => !value)}>Wort verstehen <span aria-hidden="true">{open ? "⌃" : "⌄"}</span></button>
        {open ? <div id={`word-understanding-${cardId}`}><WordUnderstandingContent enrichment={enrichment} swahili={swahili} german={german} /></div> : null}
        {saved ? <p role="status" className="mt-2 text-xs text-emerald-700">Worterklärung gespeichert</p> : null}
    </section>;
    return <section className="trainer-learning-feature" aria-label="Wort verstehen">
        <h3>Wort verstehen</h3><p>Sieh dir Wortform, Klasse und Verwendung im Satz an.</p>
        <button type="button" className="btn btn-secondary min-h-11" disabled={generating} onClick={() => void generate()}>{generating ? "Worterklärung wird erstellt …" : error ? "Erneut versuchen" : "Worterklärung erzeugen"}</button>
        {error ? <p role="alert">Die Worterklärung konnte gerade nicht erstellt werden.</p> : null}
    </section>;
}
