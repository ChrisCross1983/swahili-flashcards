import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireUser: vi.fn(),
    inQuery: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
    sign: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from: mocks.from } }));
vi.mock("@/lib/server/cardMediaUrls", () => ({
    CardMediaSigningError: class CardMediaSigningError extends Error {},
    signAuthorizedCardMediaUrls: mocks.sign,
}));

import { POST } from "./route";

function request(body: unknown) {
    return new Request("http://localhost/api/cards/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/cards/media", () => {
    beforeEach(() => {
        mocks.requireUser.mockReset().mockResolvedValue({ user: { id: "owner-1" }, response: null });
        mocks.sign.mockReset().mockResolvedValue({
            "own-card": { imageUrl: "https://storage.test/signed-image", audioUrl: null, expiresAt: "2030-01-01T00:00:00.000Z" },
        });
        mocks.inQuery.mockReset().mockResolvedValue({ data: [{ id: "own-card", image_path: "legacy-image.webp", audio_path: null }], error: null });
        mocks.eq.mockReset().mockReturnValue({ in: mocks.inQuery });
        mocks.select.mockReset().mockReturnValue({ eq: mocks.eq });
        mocks.from.mockReset().mockReturnValue({ select: mocks.select });
    });

    it("returns signed media only for owner-scoped card rows and disables shared caching", async () => {
        const response = await POST(request({ cardIds: ["own-card"], storagePath: "other-owner/secret.m4a" }));
        expect(response.status).toBe(200);
        expect(mocks.eq).toHaveBeenCalledWith("owner_key", "owner-1");
        expect(mocks.inQuery).toHaveBeenCalledWith("id", ["own-card"]);
        expect(mocks.sign).toHaveBeenCalledWith([{ id: "own-card", image_path: "legacy-image.webp", audio_path: null }]);
        await expect(response.json()).resolves.toMatchObject({ media: { "own-card": { imageUrl: "https://storage.test/signed-image" } } });
        expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
        expect(response.headers.get("Vary")).toBe("Cookie");
    });

    it("does not reveal URLs for foreign or unknown cards", async () => {
        mocks.inQuery.mockResolvedValue({ data: [], error: null });
        mocks.sign.mockResolvedValue({});
        const response = await POST(request({ cardIds: ["foreign-card"] }));
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ media: {} });
    });

    it("fails closed when signing fails and rejects malformed batches", async () => {
        mocks.sign.mockRejectedValue(new Error("provider_failure"));
        await expect(POST(request({ cardIds: ["own-card"] })).then((response) => response.status)).resolves.toBe(503);
        await expect(POST(request({ cardIds: [] })).then((response) => response.status)).resolves.toBe(400);
    });
});
