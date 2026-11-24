import { isValidElement, type ReactElement, type ReactNode } from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerDashboard from "@/components/trainer/TrainerDashboard";
import TrainerLoading from "@/app/trainer/loading";

type ClickableElement = ReactElement<{ children?: ReactNode; onClick: () => void }>;

function textOf(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
    return "";
}

function findButtonByText(node: ReactNode, text: string): ClickableElement | null {
    if (!isValidElement<{ children?: ReactNode; onClick: () => void }>(node)) return null;
    const element = node;
    if (typeof element.type === "function") {
        const component = element.type as (props: typeof element.props) => ReactNode;
        return findButtonByText(component(element.props), text);
    }
    if (element.type === "button" && textOf(element.props.children).includes(text)) return element;
    const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
    for (const child of children) {
        const match = findButtonByText(child, text);
        if (match) return match;
    }
    return null;
}

const baseProps = {
    countsState: "ready" as const,
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
    onRetryCounts: () => { },
};

describe("TrainerDashboard start flow", () => {
    it("keeps the initial counts-pending state neutral and layout stable", () => {
        const html = renderToStaticMarkup(<TrainerDashboard {...baseProps} countsState="pending" todayDue={0} />);
        expect(html).toContain("Lernzahlen werden ermittelt");
        expect(html).toContain("Training wird vorbereitet");
        expect(html).not.toContain("Weiterlernen");
        expect(html).not.toContain("Heute lernen starten");
        expect(html).not.toContain("Wird geladen");
        expect(html).toContain('aria-label="Lernkarten werden ermittelt"');
        expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Lernkarten werden ermittelt"/);
        expect(html).toContain("min-h-14");
        expect(html).toContain("motion-safe:animate-pulse");
        expect(html).toContain("min-h-[250px]");
    });

    it("renders the same complete training tile in the server route fallback before hydration", () => {
        const fallback = renderToStaticMarkup(<TrainerLoading />);
        const clientPending = renderToStaticMarkup(<TrainerDashboard {...baseProps} countsState="pending" />);
        for (const html of [fallback, clientPending]) {
            expect(html).toContain('data-testid="trainer-dashboard-skeleton"');
            expect(html).toContain('aria-label="Lernkarten werden ermittelt"');
            expect(html).toContain("motion-safe:animate-pulse");
            expect(html).not.toContain("Heute lernen starten");
            expect(html).not.toContain("Weiterlernen starten");
        }
        expect(fallback).toContain('aria-label="Trainer wird vorbereitet"');
        expect(fallback).toContain('aria-label="Neue Wörter wird vorbereitet"');
        expect(fallback).toContain('aria-label="Meine Karten wird vorbereitet"');
        expect(fallback).toContain('aria-label="Bulk Import wird vorbereitet"');
    });

    it("does not infer a fallback training mode after a failed count request", () => {
        const html = renderToStaticMarkup(<TrainerDashboard {...baseProps} countsState="error" todayDue={0} />);
        expect(html).toContain("Erneut prüfen");
        expect(html).not.toContain("Weiterlernen starten");
    });
    it("loads the shared due count initially and refreshes it when Home becomes active", () => {
        const homeSource = fs.readFileSync(
            path.join(process.cwd(), "src/app/HomeClient.tsx"),
            "utf8",
        );
        const apiSource = fs.readFileSync(
            path.join(process.cwd(), "src/lib/trainer/api.ts"),
            "utf8",
        );
        const dueEffect = homeSource.slice(
            homeSource.indexOf("async function loadDueCount(force = false)"),
            homeSource.indexOf("async function logout()"),
        );

        expect(dueEffect).toContain("void loadDueCount()");
        expect(homeSource).toContain("const pathname = usePathname()");
        expect(dueEffect).toContain("}, [pathname]);");
        expect(dueEffect).toContain('window.addEventListener("focus", refreshWhenActive)');
        expect(dueEffect).toContain('document.addEventListener("visibilitychange", refreshWhenActive)');
        expect(dueEffect).toContain('fetchSetupCounts("vocab", undefined, controller.signal)');
        expect(dueEffect).toContain("setTodayDueCount(counts.todayDue)");
        expect(apiSource).toContain('withFilterParams("/api/learn/setup-counts", cardType, groupIds)');
        expect(apiSource).toContain('cache: "no-store"');
        expect(dueEffect).toContain("if (requestInFlight && !force) return;");
        expect(dueEffect).toContain("if (cancelled || requestId !== requestGeneration) return;");
        expect(dueEffect).toContain("requestId !== requestGeneration");
        expect(dueEffect).toContain("void loadDueCount(true)");
    });

    it("makes today learning the primary dashboard action while keeping setup reachable", () => {
        const html = renderToStaticMarkup(<TrainerDashboard {...baseProps} />);

        expect(html).toContain("Heute lernen");
        expect(html).toContain("Starte mit den nächsten Karten. 4 sind heute dran.");
        expect(html).toContain("Heute lernen starten");
        expect(html).toContain("Training anpassen");
        expect(html).toContain("Bulk Import");
        expect(html).not.toContain("📥");
        expect(html).toContain("sm:grid-cols-2");
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

        const startButton = findButtonByText(element, "Heute lernen starten");
        const setupButton = findButtonByText(element, "Training anpassen");
        expect(startButton).not.toBeNull();
        expect(setupButton).not.toBeNull();
        startButton?.props.onClick();
        setupButton?.props.onClick();

        expect(started).toBe(1);
        expect(openedSetup).toBe(1);
    });

    it("keeps fallback learning copy useful when no due cards exist", () => {
        const html = renderToStaticMarkup(
            <TrainerDashboard {...baseProps} todayDue={0} lastMissedCount={3} />,
        );

        expect(html).toContain("Weiterlernen");
        expect(html).toContain("Weiterlernen starten");
        expect(html).not.toContain("Heute lernen starten");
        expect(html).toContain("Kleine Wiederholung: 3 zuletzt nicht gewusste Karten.");
    });
});
