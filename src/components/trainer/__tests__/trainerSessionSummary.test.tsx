import fs from "node:fs";
import path from "node:path";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerSessionSummary, {
    buildTrainerSessionSummaryViewModel,
    type TrainerSessionSummaryViewModel,
} from "@/components/trainer/TrainerSessionSummary";

const noop = () => { };

function renderSummary(summary: TrainerSessionSummaryViewModel) {
    return renderToStaticMarkup(
        <TrainerSessionSummary summary={summary} onRepair={noop} onFinish={noop} />,
    );
}

function textOf(node: any): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (isValidElement(node)) return textOf((node as any).props.children);
    return "";
}

function findButtonByText(node: any, text: string): any {
    if (!isValidElement(node)) return null;
    const element = node as any;
    if (typeof node.type === "function") {
        return findButtonByText(element.type(element.props), text);
    }
    if (element.type === "button" && textOf(element.props.children).includes(text)) {
        return node;
    }
    const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
    for (const child of children) {
        const match = findButtonByText(child, text);
        if (match) return match;
    }
    return null;
}

describe("TrainerSessionSummary view model", () => {
    it("builds today complete summaries", () => {
        expect(buildTrainerSessionSummaryViewModel({
            learnMode: "LEITNER_TODAY",
            isLastMissedSession: false,
            repairDrillActive: false,
            endedEarly: false,
            lastMissedEmpty: false,
            knownCount: 4,
            wrongCount: 1,
            answeredCount: 5,
            canRepair: true,
        })).toMatchObject({
            mode: "today_complete",
            knownCount: 4,
            wrongCount: 1,
            answeredCount: 5,
            accuracy: 80,
            canRepair: true,
            isEarlyEnd: false,
        });
    });

    it("builds partial early-end summaries", () => {
        expect(buildTrainerSessionSummaryViewModel({
            learnMode: "LEITNER_TODAY",
            isLastMissedSession: false,
            repairDrillActive: false,
            endedEarly: true,
            lastMissedEmpty: false,
            knownCount: 2,
            wrongCount: 1,
            answeredCount: 3,
            canRepair: true,
        })).toMatchObject({
            mode: "today_partial",
            accuracy: 67,
            isEarlyEnd: true,
        });
    });

    it("builds last-missed and repair-completion summaries", () => {
        expect(buildTrainerSessionSummaryViewModel({
            learnMode: "DRILL",
            isLastMissedSession: true,
            repairDrillActive: false,
            endedEarly: false,
            lastMissedEmpty: false,
            knownCount: 3,
            wrongCount: 0,
            answeredCount: 3,
            remainingPoolCount: 4,
            canRepair: false,
        })).toMatchObject({
            mode: "last_missed",
            remainingPoolCount: 4,
            canRepair: false,
        });

        expect(buildTrainerSessionSummaryViewModel({
            learnMode: "DRILL",
            isLastMissedSession: true,
            repairDrillActive: true,
            endedEarly: false,
            lastMissedEmpty: false,
            knownCount: 1,
            wrongCount: 0,
            answeredCount: 1,
            canRepair: false,
        })).toMatchObject({
            mode: "repair_complete",
        });
    });

    it("builds drill completion summaries and only enables repair when items are available", () => {
        expect(buildTrainerSessionSummaryViewModel({
            learnMode: "DRILL",
            isLastMissedSession: false,
            repairDrillActive: false,
            endedEarly: false,
            lastMissedEmpty: false,
            knownCount: 1,
            wrongCount: 1,
            answeredCount: 2,
            canRepair: false,
        })).toMatchObject({
            mode: "drill_complete",
            canRepair: false,
        });
    });
});

describe("TrainerSessionSummary rendering", () => {
    it("renders stats, next-step guidance, and repair recommendation when available", () => {
        const html = renderSummary({
            mode: "drill_complete",
            knownCount: 1,
            wrongCount: 1,
            answeredCount: 2,
            accuracy: 50,
            canRepair: true,
        });

        expect(html).toContain("Session abgeschlossen");
        expect(html).toContain("Gewusst");
        expect(html).toContain("Nicht gewusst");
        expect(html).toContain("Trefferquote");
        expect(html).toContain("Fehler kurz wiederholen");
        expect(html).toContain("Nächster sinnvoller Schritt");
        expect(html).toContain("Fertig");
    });

    it("hides repair when there are no wrong answers or repair items", () => {
        const html = renderSummary({
            mode: "today_complete",
            knownCount: 3,
            wrongCount: 0,
            answeredCount: 3,
            accuracy: 100,
            canRepair: false,
        });

        expect(html).toContain("Training abgeschlossen");
        expect(html).toContain("Starke Runde");
        expect(html).not.toContain("Fehler kurz wiederholen");
    });

    it("preserves last-missed pool and early-end wording", () => {
        const html = renderSummary({
            mode: "last_missed",
            knownCount: 2,
            wrongCount: 1,
            answeredCount: 3,
            accuracy: 67,
            remainingPoolCount: 9,
            canRepair: true,
            isEarlyEnd: true,
        });

        expect(html).toContain("Wiederholung beendet");
        expect(html).toContain("Gezählt werden nur Karten, die du in dieser Runde beantwortet hast.");
        expect(html).toContain("Im Fehlerpool verbleiben noch 9 Karten.");
        expect(html).toContain("Wiederholt nur die nicht gewussten Karten aus dieser Runde.");
    });

    it("keeps empty last-missed summaries concise", () => {
        const html = renderSummary({
            mode: "last_missed",
            knownCount: 0,
            wrongCount: 0,
            answeredCount: 0,
            accuracy: 0,
            remainingPoolCount: 0,
            canRepair: false,
        });

        expect(html).toContain("Keine zuletzt nicht gewussten Karten");
        expect(html).toContain("Der Fehlerpool ist leer.");
        expect(html).not.toContain("In dieser Runde:");
        expect(html).not.toContain("0/0");
        expect(html).not.toContain("Fehler kurz wiederholen");
    });

    it("renders repair completion copy", () => {
        const html = renderSummary({
            mode: "repair_complete",
            knownCount: 1,
            wrongCount: 0,
            answeredCount: 1,
            accuracy: 100,
            remainingPoolCount: 0,
            canRepair: false,
        });

        expect(html).toContain("Fehler kurz wiederholt");
        expect(html).toContain("Die kurze Fehlerwiederholung ist abgeschlossen.");
        expect(html).toContain("Im Fehlerpool verbleiben keine Karten mehr.");
    });

    it("fires action callbacks through the summary surface", () => {
        let repaired = 0;
        let finished = 0;
        const element = (
            <TrainerSessionSummary
                summary={{
                    mode: "drill_complete",
                    knownCount: 1,
                    wrongCount: 1,
                    answeredCount: 2,
                    accuracy: 50,
                    canRepair: true,
                }}
                onRepair={() => { repaired += 1; }}
                onFinish={() => { finished += 1; }}
            />
        );

        findButtonByText(element, "Fehler kurz wiederholen").props.onClick();
        findButtonByText(element, "Fertig").props.onClick();

        expect(repaired).toBe(1);
        expect(finished).toBe(1);
    });

    it("keeps action callbacks wired by prop name", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/components/trainer/TrainerSessionSummary.tsx"), "utf8");

        expect(source).toContain("onRepair");
        expect(source).toContain("onFinish");
        expect(source).toContain("onRepeat={onRepair}");
        expect(source).toContain("onFinish={onFinish}");
    });
});
