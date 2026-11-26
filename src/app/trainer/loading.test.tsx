import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerLoading from "./loading";

describe("trainer route loading state", () => {
    it("shows all four dashboard destinations while the server resolves the counts", () => {
        const html = renderToStaticMarkup(<TrainerLoading />);
        expect(html).toContain("Training</h2>");
        expect(html).toContain("Neue Wörter");
        expect(html).toContain("Meine Karten");
        expect(html).toContain("Bulk Import");
        expect(html).toContain('data-testid="trainer-dashboard-counts-pending"');
        expect(html).toContain("Training starten");
    });
});
