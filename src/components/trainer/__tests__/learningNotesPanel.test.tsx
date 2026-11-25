import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import LearningHelpPanel from "@/components/trainer/LearningHelpPanel";

describe("learning notes panel", () => {
    it("renders a single forgiving notes field", () => {
        const html = renderToStaticMarkup(
            <LearningHelpPanel
                loading={false}
                draft={{ mainNotes: "" }}
                saveStateText={null}
                onChange={vi.fn()}
                onSave={vi.fn()}
                onCancel={vi.fn()}
                saving={false}
            />,
        );

        expect(html).toContain("textarea");
        expect(html).toContain("erst mit");
        expect(html).toContain("Speichern");
        expect(html).toContain("Abbrechen");
        expect(html).not.toContain("Notizvorschau");
        expect(html.match(/<textarea/g)).toHaveLength(1);
        expect(html).toContain("Notiz");
        expect(html).toContain("min-h-[220px]");
        expect(html).toContain("text-base");
        expect(html).not.toContain("Beispielsatz");
        expect(html).not.toContain("Verwechslungswort");
    });

    it("offers explicit removal only for a persisted note", () => {
        const existing = renderToStaticMarkup(<LearningHelpPanel loading={false} draft={{ mainNotes: "Gespeichert" }} saveStateText={null} onChange={vi.fn()} onSave={vi.fn()} onCancel={vi.fn()} saving={false} canRemove onRequestRemove={vi.fn()} />);
        const empty = renderToStaticMarkup(<LearningHelpPanel loading={false} draft={{ mainNotes: "" }} saveStateText={null} onChange={vi.fn()} onSave={vi.fn()} onCancel={vi.fn()} saving={false} />);
        expect(existing).toContain("Notiz entfernen");
        expect(empty).not.toContain("Notiz entfernen");
    });
});
