import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import CompactOverlay from "@/components/CompactOverlay";

describe("compact overlay focus stability", () => {
    it("centers a bounded dialog on desktop and mobile with a scrollable content area", () => {
        const html = renderToStaticMarkup(createElement(CompactOverlay, { open: true, title: "Wort verstehen", onClose: () => {}, children: createElement("p", null, "Inhalt") }));
        expect(html).toContain("items-center justify-center");
        expect(html).toContain("max-h-[calc(100dvh-2rem)]");
        expect(html).toContain("overflow-auto overscroll-contain");
        expect(html).toContain('aria-modal="true"');
    });
    it("keeps close-focus effect tied to open state instead of parent callback identity", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/components/CompactOverlay.tsx"), "utf8");

        expect(source).toContain("const onCloseRef = useRef(onClose);");
        expect(source).toContain("onCloseRef.current = onClose;");
        expect(source).toContain("onCloseRef.current();");
        expect(source).toContain("blurActiveOverlayElement();");
        expect(source).toContain("canAutoFocusOverlayControl()");
        expect(source).toContain("}, [open]);");
    });
});
