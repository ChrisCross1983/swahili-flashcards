import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TrainerCard from "../TrainerCard";
import TrainerControls from "../TrainerControls";
import TrainerVocabExtras from "../TrainerVocabExtras";

const extras = (imagePath: string | null, hasNote = false) => <TrainerVocabExtras
    cardId="test-card" german="Buch" swahili="kitabu" imagePath={imagePath} imageBaseUrl="https://example.test/images"
    enrichment={null} hasNote={hasNote} notesOpen={false} hasAudio={false} isRecording={false} onAudio={vi.fn()} onOpenNotes={vi.fn()} onWordSaved={vi.fn()} onImageSaved={vi.fn()}
/>;

describe("compact vocabulary learning flow", () => {
    it("shows four accessible learning actions only after reveal without expanding extras", () => {
        const render = (reveal: boolean) => renderToStaticMarkup(<TrainerCard
            reveal={reveal} prompt="Buch" answer="kitabu" imagePath="test.webp" imageBaseUrl="https://example.test/images"
            compactVocabExtras learningFeature={extras("test.webp", true)} onOpenLearningHelp={vi.fn()}
        />);
        const front = render(false);
        const back = render(true);
        expect(front).not.toContain("Verstehen");
        expect(front).not.toContain("kitabu");
        expect(back).toContain('data-testid="trainer-vocab-extras"');
        expect(back).toContain("Verstehen");
        expect(back).toContain("Bild");
        expect(back).toContain("Notiz");
        expect(back).toContain("Audio");
        expect(back).toContain('grid-cols-4');
        expect(back).toContain('aria-haspopup="dialog"');
        expect(back).toContain('data-present="true"');
        expect(back).not.toContain("Wortwissen wird geladen");
        expect(back).not.toContain('src="https://example.test/images/test.webp"');
        expect(back).not.toContain("Eigene Notizen");
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
        expect(client).toContain('aria-label="Weitere Kartenaktionen"');
    });
});
