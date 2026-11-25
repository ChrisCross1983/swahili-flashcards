import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, createClient, upload, remove, selectResult, referenceResult, updateResult } = vi.hoisted(() => {
    const requireUser = vi.fn();
    const upload = vi.fn();
    const remove = vi.fn();
    const selectResult = vi.fn();
    const referenceResult = vi.fn();
    const updateResult = vi.fn();
    const supabase = {
        from: () => ({
            select: () => {
                const query = {
                    eq: () => query,
                    single: selectResult,
                    limit: referenceResult,
                };
                return query;
            },
            update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: updateResult }) }) }) }),
        }),
        storage: { from: () => ({ upload, remove }) },
    };
    return { requireUser, createClient: vi.fn(() => supabase), upload, remove, selectResult, referenceResult, updateResult };
});

vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { DELETE, POST } from "./route";

function request() {
    const form = new FormData();
    form.append("file", new File(["audio"], "recording.webm", { type: "audio/webm" }));
    form.append("cardId", "card-1");
    return new Request("http://localhost/api/upload-audio", { method: "POST", body: form });
}

function deleteRequest() {
    return new Request("http://localhost/api/upload-audio", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: "card-1" }),
    });
}

describe("audio replacement lifecycle", () => {
    beforeEach(() => {
        requireUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
        selectResult.mockReset().mockResolvedValue({ data: { audio_path: "user-1/card-1-old.webm" }, error: null });
        referenceResult.mockReset().mockResolvedValue({ data: [], error: null });
        updateResult.mockReset().mockResolvedValue({ data: { id: "card-1" }, error: null });
        upload.mockReset().mockResolvedValue({ error: null });
        remove.mockReset().mockResolvedValue({ error: null });
    });

    it("removes the old audio after a successful DB update", async () => {
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(remove).toHaveBeenCalledWith(["user-1/card-1-old.webm"]);
    });

    it("rolls back the new audio and leaves the old object on DB failure", async () => {
        updateResult.mockResolvedValue({ data: null, error: { code: "db_down" } });
        const response = await POST(request());
        expect(response.status).toBe(500);
        expect(remove).toHaveBeenCalledTimes(1);
        const rolledBackPath = remove.mock.calls[0][0][0] as string;
        expect(rolledBackPath).toMatch(/^user-1\/card-1-\d+\.webm$/);
        expect(rolledBackPath).not.toBe("user-1/card-1-old.webm");
    });

    it("keeps a successful replacement successful when old-object cleanup fails", async () => {
        remove.mockResolvedValue({ error: { code: "storage_down" } });
        const log = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const response = await POST(request());
            expect(response.status).toBe(200);
            expect(log).toHaveBeenCalled();
        } finally { log.mockRestore(); }
    });

    it("clears the owned audio reference before removing an unshared object", async () => {
        const response = await DELETE(deleteRequest());
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ audio_path: null });
        expect(remove).toHaveBeenCalledWith(["user-1/card-1-old.webm"]);
    });

    it("retains an audio object still referenced by another owned card", async () => {
        referenceResult.mockResolvedValue({ data: [{ id: "card-2" }], error: null });
        const response = await DELETE(deleteRequest());
        expect(response.status).toBe(200);
        expect(remove).not.toHaveBeenCalled();
    });

    it("keeps the object reference intact when removing the audio record fails", async () => {
        updateResult.mockResolvedValue({ data: null, error: { code: "db_down" } });
        const response = await DELETE(deleteRequest());
        expect(response.status).toBe(500);
        expect(remove).not.toHaveBeenCalled();
    });
});
