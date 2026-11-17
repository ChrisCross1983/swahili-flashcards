import { describe, expect, it } from "vitest";
import { parseHealthWindow, parseOptionalUserId, parsePage } from "./healthParams";

const now = new Date("2026-11-16T23:45:00.000Z");

describe("health query parameters", () => {
    it("uses inclusive UTC calendar days with an exclusive upper bound", () => {
        expect(parseHealthWindow(new URLSearchParams("period=today"), now)).toMatchObject({ from: "2026-11-16T00:00:00.000Z", to: "2026-11-17T00:00:00.000Z" });
        expect(parseHealthWindow(new URLSearchParams("period=yesterday"), now)).toMatchObject({ from: "2026-11-15T00:00:00.000Z", to: "2026-11-16T00:00:00.000Z" });
        expect(parseHealthWindow(new URLSearchParams("period=7d"), now)).toMatchObject({ from: "2026-11-10T00:00:00.000Z", to: "2026-11-17T00:00:00.000Z" });
        expect(parseHealthWindow(new URLSearchParams("period=30d"), now)).toMatchObject({ from: "2026-10-18T00:00:00.000Z", to: "2026-11-17T00:00:00.000Z" });
        expect(parseHealthWindow(new URLSearchParams("period=custom&from=2026-11-01&to=2026-11-16"), now)).toMatchObject({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-17T00:00:00.000Z" });
    });
    it("rejects invalid ranges, IDs and excessive pages", () => {
        for (const value of ["period=custom&from=2026-11-32&to=2026-11-16", "period=custom&from=2026-11-17&to=2026-11-18", "period=custom&from=2026-10-01&to=2026-11-16", "period=all"]) {
            expect(parseHealthWindow(new URLSearchParams(value), now)).toBeNull();
        }
        expect(parsePage(new URLSearchParams("page=2&pageSize=50"))).toMatchObject({ offset: 50 });
        expect(parsePage(new URLSearchParams("page=0"))).toBeNull();
        expect(parsePage(new URLSearchParams("pageSize=51"))).toBeNull();
        expect(parseOptionalUserId(new URLSearchParams("userId=not-a-uuid"))).toBeUndefined();
    });
});
