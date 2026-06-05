import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerSessionTransition from "@/components/trainer/TrainerSessionTransition";

describe("TrainerSessionTransition", () => {
    it("renders a calm direct-start transition surface", () => {
        const html = renderToStaticMarkup(<TrainerSessionTransition />);

        expect(html).toContain("role=\"status\"");
        expect(html).toContain("Heute lernen wird vorbereitet");
        expect(html).toContain("Deine Karten werden geladen.");
        expect(html).toContain("motion-safe:animate-pulse");
    });
});
