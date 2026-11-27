import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TrainerCard from "../TrainerCard";
import TrainerControls from "../TrainerControls";
import TrainerVocabExtras from "../TrainerVocabExtras";

const extras = (hasNote = false, hasAudio = false) => <TrainerVocabExtras
    cardId="test-card" german="Buch" swahili="kitabu"
    enrichment={null} hasNote={hasNote} notesOpen={false} hasAudio={hasAudio} isRecording={false} onAudio={vi.fn()} onOpenNotes={vi.fn()} onWordSaved={vi.fn()}
    imagePath="test.webp" onImageSaved={vi.fn()}
/>;

const withoutImage = <TrainerVocabExtras cardId="test-card" german="Buch" swahili="kitabu" enrichment={null}
    hasNote={false} notesOpen={false} hasAudio={false} isRecording={false} onAudio={vi.fn()} onOpenNotes={vi.fn()} onWordSaved={vi.fn()}
    imagePath={null} onImageSaved={vi.fn()} />;

describe("compact vocabulary learning flow", () => {
    it("shows accessible learning actions before the compact image after reveal", () => {
        const render = (reveal: boolean) => renderToStaticMarkup(<TrainerCard
            reveal={reveal} prompt="Buch" answer="kitabu" imagePath="test.webp" imageUrl="https://example.test/images/test.webp"
            compactVocabExtras learningFeature={extras(true)} onOpenLearningHelp={vi.fn()}
        />);
        const front = render(false);
        const back = render(true);
        expect(front).not.toContain("Verstehen");
        expect(front).not.toContain("kitabu");
        expect(front).not.toContain('data-testid="trainer-inline-image"');
        expect(back).toContain('data-testid="trainer-vocab-extras"');
        expect(back).toContain('data-testid="trainer-inline-image"');
        expect(back).toContain('src="https://example.test/images/test.webp"');
        expect(back).toContain("Verstehen");
        expect(back).toContain("Notiz");
        expect(back).toContain("Audio");
        expect(back).toContain('aria-label="Audio öffnen"');
        expect(back).toContain('grid-cols-3');
        expect(back).not.toContain('aria-label="Bild öffnen"');
        expect(back).toContain('aria-haspopup="dialog"');
        expect(back.indexOf('data-testid="trainer-vocab-extras"')).toBeLessThan(back.indexOf('data-testid="trainer-inline-image"'));
        expect(back).toContain('aria-label="Kartenbild vergrößern"');
        expect(back).toContain("cursor-zoom-in");
        expect(back).toContain("20dvh");
        expect(back).toContain('data-present="true"');
        expect(back).not.toContain("Wortwissen wird geladen");
        expect(back).not.toContain("Eigene Notizen");
    });
    it("gives every learning action the same pointer, focus and pressed feedback while retaining content states", () => {
        const buttons = (hasNote = false, hasAudio = false) =>
            renderToStaticMarkup(extras(hasNote, hasAudio)).match(/<button\b[^>]*>/g) ?? [];
        const empty = buttons();
        expect(empty).toHaveLength(3);
        for (const button of empty) {
            expect(button).toContain("cursor-pointer");
            expect(button).toContain("hover:border-[color:var(--accent-primary)]");
            expect(button).toContain("hover:shadow-[0_2px_6px_rgba(74,44,16,0.1)]");
            expect(button).toContain("active:scale-[0.98]");
            expect(button).toContain("focus-visible:ring-2");
            expect(button).toContain("min-h-12");
            expect(button).toContain('data-present="false"');
        }
        const filled = buttons(true, true);
        expect(filled).toHaveLength(3);
        for (const button of filled.slice(1)) {
            expect(button).toContain('data-present="true"');
            expect(button).toContain("bg-accent-cta-soft");
            expect(button).toContain("hover:brightness-[0.96]");
        }
    });
    it("keeps image creation in the same four-action row only when no image is stored", () => {
        const empty = renderToStaticMarkup(withoutImage);
        const filled = renderToStaticMarkup(extras());
        expect(empty).toContain("grid-cols-4");
        expect(empty.match(/<button\b[^>]*>/g)).toHaveLength(4);
        expect(empty).toContain('aria-label="Bild öffnen"');
        expect(empty).not.toContain("Bild erstellen");
        expect(filled).toContain("grid-cols-3");
        expect(filled.match(/<button\b[^>]*>/g)).toHaveLength(3);
        expect(filled).not.toContain('aria-label="Bild öffnen"');
        const actions = empty.match(/<button\b[^>]*>/g) ?? [];
        expect(actions[3]?.match(/class="([^"]+)"/)?.[1]).toBe(actions[0]?.match(/class="([^"]+)"/)?.[1]);
    });
    it("keeps grading separate from optional content and docks it on mobile", () => {
        const controls = renderToStaticMarkup(<TrainerControls reveal hasAudio={false} onReveal={vi.fn()} onPlayAudio={vi.fn()} onWrong={vi.fn()} onCorrect={vi.fn()} docked />);
        const desktopControls = renderToStaticMarkup(<TrainerControls reveal hasAudio={false} onReveal={vi.fn()} onPlayAudio={vi.fn()} onWrong={vi.fn()} onCorrect={vi.fn()} compact />);
        expect(controls).toContain("Nicht gewusst");
        expect(controls).toContain("Gewusst");
        expect(controls).not.toMatch(/ disabled(?:=""|>)/);
        expect(desktopControls).toContain("mt-3");
        const client = readFileSync("src/app/trainer/TrainerClient.tsx", "utf8");
        expect(client).toContain('data-testid="trainer-mobile-actions"');
        expect(client).toContain("env(safe-area-inset-bottom)");
        expect(client).toContain('order-2 hidden md:block');
        expect(client).toContain("<TrainerVocabExtras");
        expect(client).toContain('data-testid="card-compact-actions"');
        expect(client).not.toContain('aria-label="Weitere Kartenaktionen"');
    });

    it("keeps removal controls behind explicit confirmations and retains inactive creation actions", () => {
        const source = readFileSync("src/components/trainer/TrainerVocabExtras.tsx", "utf8");
        const card = readFileSync("src/components/trainer/TrainerCard.tsx", "utf8");
        const client = readFileSync("src/app/trainer/TrainerClient.tsx", "utf8");
        expect(source).toContain("Audio entfernen");
        expect(source).toContain("audioRemoveConfirmOpen");
        expect(source).toContain("audioRemoving");
        expect(card).toContain("Bild entfernen");
        expect(card).toContain("imageRemoveConfirmOpen");
        expect(card).toContain("imageRemoving");
        expect(card).toContain("Kartenbild vergrößern");
        expect(client).toContain("notePresenceByCard[resolveCardId(currentItem)]");
        expect(client).toContain("setNotePresenceByCard((previous) => ({ ...previous, [cardId]: Boolean(noteText.trim()) }))");
        expect(client).toContain("audioRemoveLockRef.current");
        expect(client).toContain("imageRemoveLockRef.current");
    });
});
