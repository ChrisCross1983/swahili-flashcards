import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerSummaryNextStep from "@/components/trainer/TrainerSummaryNextStep";

describe("TrainerSummaryNextStep", () => {
    it("recommends repair when the round has wrong answers", () => {
        const html = renderToStaticMarkup(
            <TrainerSummaryNextStep
                wrongCount={2}
                onRepeat={() => { }}
                onFinish={() => { }}
                description="Wiederhole die Fehler kurz oder schließ diese Runde ab."
            />,
        );

        expect(html).toContain("Nächster sinnvoller Schritt");
        expect(html).toContain("Fehler kurz wiederholen");
        expect(html).toContain("Wiederhole die Fehler kurz oder schließ diese Runde ab.");
        expect(html).toContain("Fertig");
    });

    it("keeps zero-wrong summaries calm without repair recommendation", () => {
        const html = renderToStaticMarkup(
            <TrainerSummaryNextStep
                wrongCount={0}
                onRepeat={() => { }}
                onFinish={() => { }}
                description="Starke Runde. Du hast heute viele Karten sicher gewusst."
            />,
        );

        expect(html).toContain("Nächster sinnvoller Schritt");
        expect(html).toContain("Starke Runde. Du hast heute viele Karten sicher gewusst.");
        expect(html).toContain("Fertig");
        expect(html).not.toContain("Fehler kurz wiederholen");
    });
});
