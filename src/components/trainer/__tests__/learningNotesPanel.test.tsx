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
            />,
        );

        expect(html).toContain("textarea");
        expect(html).toContain("automatisch gespeichert");
        expect(html).toContain("Notiz");
        expect(html).toContain("min-h-28");
        expect(html).not.toContain("Beispielsatz");
        expect(html).not.toContain("Verwechslungswort");
    });
});
