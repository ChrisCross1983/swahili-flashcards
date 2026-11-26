import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TrainerSessionTransition from "@/components/trainer/TrainerSessionTransition";

describe("TrainerSessionTransition", () => {
    it("uses the animated lion when motion is allowed and keeps the editorial image as a reduced-motion/error fallback", () => {
        const html = renderToStaticMarkup(<TrainerSessionTransition introSoundEnabled onToggleIntroSound={() => undefined} />);
        const source = readFileSync("src/components/trainer/TrainerSessionTransition.tsx", "utf8");
        const css = readFileSync("src/components/trainer/TrainerSessionTransition.module.css", "utf8");

        expect(html).toContain("role=\"status\"");
        expect(html).toContain("Deine Lernrunde beginnt");
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain('src="/trainer-lion-editorial.webp"');
        expect(html).not.toContain("<svg");
        expect(html).toContain("items-center justify-center");
        expect(html).not.toContain("animation-delay:");
        expect(source).toContain('"/trainer-lion-intro.webp"');
        expect(source).toContain('"/trainer-lion-editorial.webp"');
        expect(source).toContain('window.matchMedia?.("(prefers-reduced-motion: reduce)")');
        expect(source).toContain("setUseAnimatedLion(!motionQuery.matches)");
        expect(source).toContain("setAnimationUnavailable(true)");
        expect(source).toContain('key={showAnimatedLion ? "trainer-lion-intro" : "trainer-lion-editorial"}');
        expect(source).toContain('aria-label={introSoundEnabled ? "Intro-Ton stummschalten" : "Intro-Ton einschalten"}');
        expect(source).toContain("aria-pressed={introSoundEnabled}");
        expect(css).toContain("@media (prefers-reduced-motion: reduce)");
        expect(css).toContain("animation: none");
        expect(css).toContain("object-fit: contain");
        expect(css).toContain("36dvh");
        expect(css).not.toContain("lionPresence");
    });
});
