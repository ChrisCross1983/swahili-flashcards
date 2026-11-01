import { describe, expect, it, vi } from "vitest";

const { requireUser, upload } = vi.hoisted(() => ({ requireUser: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { storage: { from: () => ({ upload }) } } }));
import { POST } from "./route";

describe("own image upload regression", () => {
  it("keeps the authenticated internal storage upload available", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    upload.mockResolvedValue({ error: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    const form = new FormData();
    form.append("file", new File(["image"], "photo.webp", { type: "image/webp" }));
    const response = await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.path).toMatch(/^owner-1\/[a-f0-9-]{36}\.webp$/);
    expect(upload).toHaveBeenCalledOnce();
  });
});
