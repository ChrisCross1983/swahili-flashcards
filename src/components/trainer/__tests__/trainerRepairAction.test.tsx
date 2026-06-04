import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerRepairAction from "@/components/trainer/TrainerRepairAction";

describe("TrainerRepairAction", () => {
    it("shows the repair action when the current round has wrong answers", () => {
        const html = renderToStaticMarkup(
            <TrainerRepairAction wrongCount={2} onRepeat={() => { }} />,
        );

        expect(html).toContain("Fehler kurz wiederholen");
        expect(html).toContain("Übt nur die Karten, die in dieser Runde nicht geklappt haben.");
    });

    it("hides the repair action when there are no wrong answers", () => {
        const html = renderToStaticMarkup(
            <TrainerRepairAction wrongCount={0} onRepeat={() => { }} />,
        );

        expect(html).not.toContain("Fehler kurz wiederholen");
        expect(html).not.toContain("Übt nur die Karten");
    });

    it("supports last-missed wording without changing pool copy", () => {
        const html = renderToStaticMarkup(
            <TrainerRepairAction
                wrongCount={1}
                onRepeat={() => { }}
                helperText="Wiederholt nur die nicht gewussten Karten aus dieser Runde."
            />,
        );

        expect(html).toContain("Fehler kurz wiederholen");
        expect(html).toContain("Wiederholt nur die nicht gewussten Karten aus dieser Runde.");
    });
});
