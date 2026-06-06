import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CompactOverlay from "@/components/CompactOverlay";
import ConfirmDialog from "@/components/ConfirmDialog";
import FullScreenSheet from "@/components/FullScreenSheet";
import TrainerControls from "@/components/trainer/TrainerControls";

const root = process.cwd();

function readSource(relativePath: string) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("mobile critical-flow regression coverage", () => {
    it("keeps trainer grading controls reachable and locked during in-flight grading", () => {
        const revealDuringPersistenceHtml = renderToStaticMarkup(
            <TrainerControls
                reveal={false}
                hasAudio={false}
                gradingInFlight
                onReveal={vi.fn()}
                onPlayAudio={vi.fn()}
                onWrong={vi.fn()}
                onCorrect={vi.fn()}
            />,
        );

        expect(revealDuringPersistenceHtml).toContain("Aufdecken");
        expect(revealDuringPersistenceHtml).toContain('data-tap-feedback="immediate"');
        expect(revealDuringPersistenceHtml).toContain("touch-manipulation");
        expect(revealDuringPersistenceHtml).toContain("min-h-14");
        expect(revealDuringPersistenceHtml).not.toContain("disabled=\"\"");

        const readyHtml = renderToStaticMarkup(
            <TrainerControls
                reveal
                hasAudio
                gradingInFlight={false}
                onReveal={vi.fn()}
                onPlayAudio={vi.fn()}
                onWrong={vi.fn()}
                onCorrect={vi.fn()}
            />,
        );

        expect(readyHtml).toContain("Nicht gewusst");
        expect(readyHtml).toContain("Gewusst");
        expect(readyHtml).toContain("data-grading-in-flight=\"false\"");
        expect(readyHtml).toContain('data-tap-feedback="immediate"');
        expect(readyHtml).toContain("touch-manipulation");
        expect(readyHtml).toContain("min-h-14");
        expect(readyHtml).not.toContain("disabled=\"\"");

        const lockedHtml = renderToStaticMarkup(
            <TrainerControls
                reveal
                hasAudio
                gradingInFlight
                onReveal={vi.fn()}
                onPlayAudio={vi.fn()}
                onWrong={vi.fn()}
                onCorrect={vi.fn()}
            />,
        );

        expect(lockedHtml).toContain("Nicht gewusst");
        expect(lockedHtml).toContain("Gewusst");
        expect(lockedHtml).toContain("data-grading-in-flight=\"true\"");
        expect(lockedHtml).toContain("aria-busy=\"true\"");
        expect(lockedHtml).toContain("disabled=\"\"");
    });

    it("keeps overlay layering ordered above trainer sheets and below confirmations", () => {
        const sheetHtml = renderToStaticMarkup(
            <FullScreenSheet open title="Meine Karten" onClose={vi.fn()}>
                <button type="button">Sheet action</button>
            </FullScreenSheet>,
        );
        const compactHtml = renderToStaticMarkup(
            <CompactOverlay open title="Eigene Notizen" onClose={vi.fn()}>
                <textarea className="text-base" defaultValue="Notiz" />
            </CompactOverlay>,
        );
        const confirmHtml = renderToStaticMarkup(
            <ConfirmDialog
                open
                title="Ausgewählte Karten löschen?"
                description="Diese Aktion löscht ausgewählte Karten endgültig."
                confirmLabel="Jetzt löschen"
                cancelLabel="Abbrechen"
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );

        expect(sheetHtml).toContain("z-[120]");
        expect(sheetHtml).toContain("h-[100dvh]");
        expect(sheetHtml).toContain("aria-label=\"Schließen\"");

        expect(compactHtml).toContain("z-[130]");
        expect(compactHtml).toContain("role=\"dialog\"");
        expect(compactHtml).toContain("aria-modal=\"true\"");
        expect(compactHtml).toContain("data-testid=\"compact-overlay-backdrop\"");

        expect(confirmHtml).toContain("z-[160]");
        expect(confirmHtml).toContain("role=\"dialog\"");
        expect(confirmHtml).toContain("Jetzt löschen");
        expect(confirmHtml).toContain("Abbrechen");
    });

    it("keeps mobile overlay focus and scroll cleanup centralized for search, notes, sheets, and AI chat", () => {
        const overlayLock = readSource("src/lib/ui/overlayLock.ts");
        const quickSearch = readSource("src/components/GlobalQuickSearch.tsx");
        const aiChat = readSource("src/components/GlobalAiChat.tsx");
        const compact = readSource("src/components/CompactOverlay.tsx");
        const sheet = readSource("src/components/FullScreenSheet.tsx");

        expect(overlayLock).toContain("lockCount");
        expect(overlayLock).toContain("previousOverflow");
        expect(overlayLock).toContain("blurActiveOverlayElement");
        expect(overlayLock).toContain("active.blur()");
        expect(overlayLock).toContain("canAutoFocusOverlayControl");
        expect(overlayLock).toContain("(pointer: coarse)");

        for (const source of [quickSearch, aiChat, compact, sheet]) {
            expect(source).toContain("blurActiveOverlayElement");
            expect(source).toContain("lockBodyScroll");
            expect(source).toContain("unlockBodyScroll");
            expect(source).not.toContain(".style.transform");
            expect(source).not.toContain(".style.zoom");
        }

        expect(aiChat).toContain("focusInputIfStable");
        expect(aiChat).toContain("canAutoFocusOverlayControl()");
        expect(aiChat).not.toContain("autoFocus");
        expect(quickSearch).not.toContain("autoFocus");
    });

    it("keeps floating tools visible in focused mobile trainer mode without covering answer controls", () => {
        const overlays = readSource("src/components/GlobalOverlays.tsx");

        expect(overlays).toContain("focusedTrainerMode");
        expect(overlays).toContain("data-focused-trainer-tools");
        expect(overlays).toContain("top-[max(4.5rem,calc(env(safe-area-inset-top)+4.5rem))]");
        expect(overlays).toContain("bottom-[max(0.75rem,env(safe-area-inset-bottom))]");
        expect(overlays).toContain("pointer-events-none");
        expect(overlays).toContain("pointer-events-auto");
        expect(overlays).toContain("z-[125]");
        expect(overlays).not.toContain("z-[2147483647]");
    });

    it("keeps card-form duplicate feedback visible near primary fields and persistent after create reset", () => {
        const form = readSource("src/components/trainer/TrainerCardFormSheet.tsx");
        const duplicateHook = readSource("src/lib/trainer/useTrainerCardDuplicateCheck.ts");
        const germanIndex = form.indexOf("placeholder=\"z.B. Guten Morgen\"");
        const swahiliIndex = form.indexOf("placeholder=\"z.B. Habari za asubuhi\"");
        const topStatusIndex = form.indexOf("topStatusText ? (");
        const duplicatePanelIndex = form.indexOf("{duplicateFeedbackPanel}");
        const optionalExamplesIndex = form.indexOf("Optional: Beispielsätze hinzufügen");

        expect(germanIndex).toBeGreaterThan(-1);
        expect(swahiliIndex).toBeGreaterThan(germanIndex);
        expect(topStatusIndex).toBeGreaterThan(swahiliIndex);
        expect(topStatusIndex).toBeLessThan(optionalExamplesIndex);
        expect(duplicatePanelIndex).toBeGreaterThan(swahiliIndex);
        expect(duplicatePanelIndex).toBeLessThan(optionalExamplesIndex);

        expect(duplicateHook).toContain("Prüfe auf ähnliche Karten …");
        expect(duplicateHook).toContain("Mögliche Dublette gefunden");
        expect(duplicateHook).toContain("Ähnliche Karten gefunden");
        expect(form).toContain("Nicht zwingend eine Dublette");
        expect(form).toContain("Karte gespeichert ✅");
        expect(form).toContain("Du kannst direkt die nächste Karte anlegen.");
        expect(form).toContain("aria-live=\"polite\"");
    });

    it("keeps duplicate review deletion manual with a visible confirmation above the sheet", () => {
        const duplicateReview = readSource("src/components/cards/DuplicateReviewSheet.tsx");
        const confirm = readSource("src/components/ConfirmDialog.tsx");

        expect(duplicateReview).toContain("setSelectedDeleteIds({});");
        expect(duplicateReview).toContain("disabled={deleting || selectedCount === 0 || clusters.length === 0}");
        expect(duplicateReview).toContain("Bitte Karten zum Löschen auswählen.");
        expect(duplicateReview).toContain("Zum Löschen auswählen:");
        expect(duplicateReview).toContain("setConfirmOpen(true)");
        expect(duplicateReview).toContain('fetch("/api/cards/duplicates/delete"');
        expect(duplicateReview).toContain("body: JSON.stringify({ cardIds: selectedIds })");
        expect(confirm).toContain("z-[160]");
    });

    it("keeps quick-search edit on the shared trainer card form path", () => {
        const quickSearch = readSource("src/components/GlobalQuickSearch.tsx");
        const trainerForm = readSource("src/components/trainer/TrainerCardFormSheet.tsx");
        const duplicateHook = readSource("src/lib/trainer/useTrainerCardDuplicateCheck.ts");
        const groupPicker = readSource("src/components/groups/CompactGroupPicker.tsx");

        expect(quickSearch).toContain("<TrainerCardFormSheet");
        expect(quickSearch).toContain("cardFormRef.current?.openEdit");
        expect(quickSearch).toContain("fetchGroups(\"vocab\")");
        expect(quickSearch).toContain("groups={groups}");
        expect(quickSearch).toContain("onUpdated={(card, nextGroups) => handleSaved(card, nextGroups)}");
        expect(quickSearch).toContain("onAudioUpdated");
        expect(quickSearch).toContain("handleEdit");
        expect(trainerForm).toContain("useTrainerCardDuplicateCheck");
        expect(duplicateHook).toContain('fetch("/api/cards/check-existing"');
        expect(trainerForm).toContain("<CompactGroupPicker");
        expect(groupPicker).toContain("data-viewport-safe-group-picker");
        expect(groupPicker).toContain("z-[135]");
        expect(quickSearch).not.toContain("<CardEditorSheet");
    });
});
