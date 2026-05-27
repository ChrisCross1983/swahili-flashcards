import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerLastMissedSummary from "@/components/trainer/TrainerLastMissedSummary";

describe("TrainerLastMissedSummary", () => {
    it("summarizes only the current last-missed round", () => {
        const html = renderToStaticMarkup(
            <TrainerLastMissedSummary correctCount={1} practiceAgainCount={6} remainingPoolCount={140} />,
        );

        expect(html).toContain("In dieser Runde:");
        expect(html).toContain("Gewusst");
        expect(html).toContain("Nochmal üben");
        expect(html).toContain("Noch 140 Karten im Fehlerpool");
        expect(html).not.toContain("1/7");
        expect(html).not.toContain("Nicht gewusst");
    });

    it("omits the pool line when no reliable pool count is provided", () => {
        const html = renderToStaticMarkup(
            <TrainerLastMissedSummary correctCount={1} practiceAgainCount={6} remainingPoolCount={null} />,
        );

        expect(html).toContain("In dieser Runde:");
        expect(html).not.toContain("Fehlerpool");
    });
});
