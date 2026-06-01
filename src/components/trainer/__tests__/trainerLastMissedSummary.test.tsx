import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerLastMissedSummary from "@/components/trainer/TrainerLastMissedSummary";

describe("TrainerLastMissedSummary", () => {
    it("summarizes only the current last-missed round", () => {
        const html = renderToStaticMarkup(
            <TrainerLastMissedSummary correctCount={1} practiceAgainCount={6} attemptedCount={7} remainingPoolCount={140} />,
        );

        expect(html).toContain("In dieser Runde:");
        expect(html).toContain("Gewusst");
        expect(html).toContain("Nochmal üben");
        expect(html).toContain("1/7");
        expect(html).toContain("Trefferquote");
        expect(html).toContain("14%");
        expect(html).toContain("Noch 140 Karten im Fehlerpool");
        expect(html).not.toContain("Nicht gewusst");
    });

    it("omits the pool line when no reliable pool count is provided", () => {
        const html = renderToStaticMarkup(
            <TrainerLastMissedSummary correctCount={1} practiceAgainCount={6} remainingPoolCount={null} />,
        );

        expect(html).toContain("In dieser Runde:");
        expect(html).not.toContain("Fehlerpool");
    });

    it("clarifies early endings and does not count unattempted pool cards as wrong", () => {
        const html = renderToStaticMarkup(
            <TrainerLastMissedSummary
                correctCount={2}
                practiceAgainCount={1}
                attemptedCount={3}
                remainingPoolCount={140}
                endedEarly
            />,
        );

        expect(html).toContain("2/3");
        expect(html).toContain("67%");
        expect(html).toContain("Nur beantwortete Karten werden gezählt");
        expect(html).toContain("offene Karten bleiben im Fehlerpool");
        expect(html).not.toContain("2/140");
        expect(html).not.toContain("138");
    });
});
