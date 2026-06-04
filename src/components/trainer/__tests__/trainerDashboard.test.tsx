import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerDashboard from "@/components/trainer/TrainerDashboard";

function textOf(node: any): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (isValidElement(node)) return textOf((node as any).props.children);
    return "";
}

function findButtonByText(node: any, text: string): any {
    if (!isValidElement(node)) return null;
    const element = node as any;
    if (typeof element.type === "function") return findButtonByText(element.type(element.props), text);
    if (element.type === "button" && textOf(element.props.children).includes(text)) return element;
    const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
    for (const child of children) {
        const match = findButtonByText(child, text);
        if (match) return match;
    }
    return null;
}

const baseProps = {
    todayDue: 4,
    totalCards: 20,
    lastMissedCount: 2,
    isSentenceTrainer: false,
    createLabel: "Neue Wörter anlegen",
    createHint: "Neue Karte anlegen.",
    cardsLabel: "Meine Karten",
    importVisible: true,
    onStartLearning: () => { },
    onOpenLearn: () => { },
    onOpenCreate: () => { },
    onOpenCards: () => { },
    onOpenImport: () => { },
};

describe("TrainerDashboard start flow", () => {
    it("makes today learning the primary dashboard action while keeping setup reachable", () => {
        const html = renderToStaticMarkup(<TrainerDashboard {...baseProps} />);

        expect(html).toContain("Heute lernen");
        expect(html).toContain("4 Karten warten auf dich.");
        expect(html).toContain("Heute lernen starten");
        expect(html).toContain("Anpassen");
    });

    it("fires separate callbacks for direct start and setup customization", () => {
        let started = 0;
        let openedSetup = 0;
        const element = (
            <TrainerDashboard
                {...baseProps}
                onStartLearning={() => { started += 1; }}
                onOpenLearn={() => { openedSetup += 1; }}
            />
        );

        findButtonByText(element, "Heute lernen starten").props.onClick();
        findButtonByText(element, "Anpassen").props.onClick();

        expect(started).toBe(1);
        expect(openedSetup).toBe(1);
    });

    it("keeps fallback learning copy useful when no due cards exist", () => {
        const html = renderToStaticMarkup(
            <TrainerDashboard {...baseProps} todayDue={0} lastMissedCount={3} />,
        );

        expect(html).toContain("Weiterlernen");
        expect(html).toContain("3 zuletzt nicht gewusste Karten kurz wiederholen.");
    });
});
