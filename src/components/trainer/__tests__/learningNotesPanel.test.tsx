import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import LearningHelpPanel from "@/components/trainer/LearningHelpPanel";

describe("learning notes panel", () => {
    it("renders personal note fields instead of AI learning tips", () => {
        const html = renderToStaticMarkup(
            <LearningHelpPanel
                loading={false}
                draft={{ mainNotes: "", memoryHint: "", exampleSentence: "", confusionNote: "" }}
                saveStateText={null}
                saving={false}
                onChange={vi.fn()}
                onSave={vi.fn()}
            />,
        );

        expect(html).toContain("Eigene Notizen");
        expect(html).toContain("Merkhilfe");
        expect(html).toContain("Beispielsatz");
        expect(html).toContain("Verwechslungswort");
        expect(html).not.toContain("Lerntipps werden vorbereitet");
    });
});
