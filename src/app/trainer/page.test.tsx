import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requestUser: vi.fn(),
    setupCounts: vi.fn(),
    redirect: vi.fn(),
}));

vi.mock("@/lib/auth/requestUser", () => ({ getRequestUser: mocks.requestUser }));
vi.mock("@/lib/server/trainerSetupCounts", () => ({ getTrainerSetupCountsForUser: mocks.setupCounts }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import TrainerPage from "./page";

describe("TrainerPage initial setup counts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requestUser.mockResolvedValue({ data: { user: { id: "user-a", email: "user@example.test" } } });
    });

    it("passes RPC counts from the verified server user into the first TrainerClient render", async () => {
        mocks.setupCounts.mockResolvedValue({ todayDue: 3, totalCards: 9, lastMissedCount: 1 });

        const page = await TrainerPage();

        expect(mocks.setupCounts).toHaveBeenCalledWith("user-a", "vocab");
        expect(page.props).toMatchObject({
            ownerKey: "user-a",
            userEmail: "user@example.test",
            initialSetupCounts: { todayDue: 3, totalCards: 9, lastMissedCount: 1 },
            initialSetupCountsState: "ready",
        });
    });

    it("renders the retry state without an initial client count request when the server RPC fails", async () => {
        mocks.setupCounts.mockRejectedValue(new Error("unavailable"));

        const page = await TrainerPage();

        expect(page.props).toMatchObject({ initialSetupCounts: null, initialSetupCountsState: "error" });
    });
});
