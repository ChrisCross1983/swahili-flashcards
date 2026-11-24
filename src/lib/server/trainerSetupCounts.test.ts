import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabaseServer", () => ({
    supabaseServer: { rpc: (...args: unknown[]) => mocks.rpc(...args) },
}));

import { getTrainerSetupCountsForUser } from "./trainerSetupCounts";

describe("getTrainerSetupCountsForUser", () => {
    beforeEach(() => mocks.rpc.mockReset());

    it("uses the authoritative count RPC with a previously verified owner key", async () => {
        mocks.rpc.mockResolvedValue({
            data: [{ today_due: "4", total_cards: "12", last_missed_count: "2" }],
            error: null,
        });

        await expect(getTrainerSetupCountsForUser("user-a", "vocab", "2026-11-24")).resolves.toEqual({
            todayDue: 4,
            totalCards: 12,
            lastMissedCount: 2,
        });
        expect(mocks.rpc).toHaveBeenCalledWith("trainer_setup_counts", {
            p_owner_key: "user-a",
            p_card_type: "vocab",
            p_today: "2026-11-24",
        });
    });

    it("does not substitute an unverified fallback when the RPC fails", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", status: 404 } });

        await expect(getTrainerSetupCountsForUser("user-a", "vocab", "2026-11-24"))
            .rejects.toMatchObject({ code: "PGRST202", status: 404 });
    });
});
