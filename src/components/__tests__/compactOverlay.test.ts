import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("compact overlay focus stability", () => {
    it("keeps close-focus effect tied to open state instead of parent callback identity", () => {
        const source = fs.readFileSync(path.join(process.cwd(), "src/components/CompactOverlay.tsx"), "utf8");

        expect(source).toContain("const onCloseRef = useRef(onClose);");
        expect(source).toContain("onCloseRef.current = onClose;");
        expect(source).toContain("onCloseRef.current();");
        expect(source).toContain("}, [open]);");
    });
});
