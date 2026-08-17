import { describe, expect, it } from "vitest";

import { formatTrainerDueDate, formatTrainerDueStatus } from "../trainerDueDate";

describe("trainer due date formatting", () => {
    it("formats due dates for display", () => {
        expect(formatTrainerDueDate("2026-08-17")).toBe("17.08.2026");
        expect(formatTrainerDueDate("not-a-date")).toBe("not-a-date");
        expect(formatTrainerDueDate(null)).toBeNull();
    });

    it("formats relative due status text", () => {
        const today = new Date("2026-08-17T12:00:00");

        expect(formatTrainerDueStatus("2026-08-16", today)).toBe("seit 1 Tag fällig");
        expect(formatTrainerDueStatus("2026-08-15", today)).toBe("seit 2 Tagen fällig");
        expect(formatTrainerDueStatus("2026-08-17", today)).toBe("heute fällig");
        expect(formatTrainerDueStatus("2026-08-20", today)).toBe("fällig in 3 Tagen");
        expect(formatTrainerDueStatus("not-a-date", today)).toBeNull();
    });
});
