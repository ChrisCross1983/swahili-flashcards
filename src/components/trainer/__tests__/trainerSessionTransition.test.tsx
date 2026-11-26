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
        expect(html).not.toContain("animation-delay:");
        expect(source).toContain('"/trainer-lion-intro-timed.webp"');
        expect(source).toContain('"/trainer-lion-editorial.webp"');
        expect(source).toContain('window.matchMedia?.("(prefers-reduced-motion: reduce)")');
        expect(source).toContain("setUseAnimatedLion(!motionQuery.matches)");
        expect(source).toContain("setAnimationUnavailable(true)");
        expect(source).toContain('key={showAnimatedLion ? "trainer-lion-intro-timed" : "trainer-lion-editorial"}');
        expect(source).toContain('aria-label={introSoundEnabled ? "Intro-Ton stummschalten" : "Intro-Ton einschalten"}');
        expect(source).toContain("aria-pressed={introSoundEnabled}");
        expect(css).toContain("@media (prefers-reduced-motion: reduce)");
        expect(css).toContain("animation: none");
        expect(css).toContain("object-fit: contain");
        expect(css).toContain("grid-template-rows: 2.75rem minmax(0, 1fr) auto auto");
        expect(css).toContain("height: max(0px, min(420px, calc(100cqh - 2rem)))");
        expect(css).toContain("100cqh");
        expect(css).toContain("height: 100%");
        expect(css).not.toContain("overflow: auto");
        expect(source).toContain("styles.soundControl");
        expect(source).toContain("styles.progressTrack");
        expect(source).toContain("className={styles.transition}");
        expect(source).not.toContain('className="absolute right-0 top-0');
        expect(css).not.toContain("lionPresence");
    });
});
