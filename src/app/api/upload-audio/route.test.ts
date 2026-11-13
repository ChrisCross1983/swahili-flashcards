import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, createClient, upload, remove, selectResult, updateResult } = vi.hoisted(() => {
    const requireUser = vi.fn();
    const upload = vi.fn();
    const remove = vi.fn();
    const selectResult = vi.fn();
    const updateResult = vi.fn();
    const supabase = {
        from: () => ({
            select: () => ({ eq: () => ({ eq: () => ({ single: selectResult }) }) }),
            update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: updateResult }) }) }) }),
        }),
        storage: { from: () => ({ upload, remove }) },
    };
    return { requireUser, createClient: vi.fn(() => supabase), upload, remove, selectResult, updateResult };
});

vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { POST } from "./route";

function request() {
    const form = new FormData();
    form.append("file", new File(["audio"], "recording.webm", { type: "audio/webm" }));
    form.append("cardId", "card-1");
    return new Request("http://localhost/api/upload-audio", { method: "POST", body: form });
}

describe("audio replacement lifecycle", () => {
    beforeEach(() => {
        requireUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
        selectResult.mockReset().mockResolvedValue({ data: { audio_path: "user-1/card-1-old.webm" }, error: null });
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
});
