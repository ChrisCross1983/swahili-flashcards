import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerSessionTransition from "@/components/trainer/TrainerSessionTransition";

describe("TrainerSessionTransition", () => {
    it("renders a centered editorial lion transition with reduced-motion support", () => {
        const html = renderToStaticMarkup(<TrainerSessionTransition />);
        const css = readFileSync("src/components/trainer/TrainerSessionTransition.module.css", "utf8");

        expect(html).toContain("role=\"status\"");
        expect(html).toContain("Lernkarten werden vorbereitet");
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain('src="/trainer-lion-editorial.webp"');
        expect(html).not.toContain("<svg");
        expect(html).toContain("items-center justify-center");
        expect(html).not.toContain("animation-delay:");
        expect(css).toContain("@media (prefers-reduced-motion: reduce)");
        expect(css).toContain("animation: none");
    });
});
