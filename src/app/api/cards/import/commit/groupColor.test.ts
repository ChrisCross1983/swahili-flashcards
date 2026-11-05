import { describe, expect, it, vi } from "vitest";

const { requireUser, from } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
import { POST } from "./route";

describe("import-created group color boundary", () => {
    it("rejects a free hex value before inserting cards or groups", async () => {
        requireUser.mockResolvedValue({ user: { id: "owner" }, response: null });
        from.mockClear();
        const response = await POST(new Request("http://localhost/api/cards/import/commit", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: [{ german: "Katze", swahili: "paka" }], createGroup: { name: "Tiere", color: "#ff0000" } }),
        }));
        expect(response.status).toBe(400);
        expect(from).not.toHaveBeenCalled();
    });
});
