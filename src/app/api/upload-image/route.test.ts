import { describe, expect, it, vi } from "vitest";

const { requireUser, upload, getBucket } = vi.hoisted(() => ({ requireUser: vi.fn(), upload: vi.fn(), getBucket: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { storage: { from: () => ({ upload }), getBucket } } }));
import { GET, POST } from "./route";

describe("own image upload regression", () => {
  it("keeps the authenticated internal storage upload available", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    upload.mockResolvedValue({ error: null });
    getBucket.mockResolvedValue({ data: { file_size_limit: 5_000_000 }, error: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    const form = new FormData();
    form.append("file", new File(["image"], "photo.webp", { type: "image/webp" }));
    const response = await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.path).toMatch(/^owner-1\/[a-f0-9-]{36}\.webp$/);
    expect(upload).toHaveBeenCalledOnce();
  });

  it("exposes the actual bucket limit and accepts a file exactly at it", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    getBucket.mockResolvedValue({ data: { file_size_limit: 4 }, error: null });
    upload.mockResolvedValue({ error: null });
    expect(await (await GET()).json()).toMatchObject({ maxBytes: 4 });
    const form = new FormData();
    form.append("file", new File(["1234"], "photo.png", { type: "image/png" }));
    expect((await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }))).status).toBe(200);
  });

  it("rejects oversize before storage and hides upstream error details", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    getBucket.mockResolvedValue({ data: { file_size_limit: 4 }, error: null });
    upload.mockClear();
    const form = new FormData();
    form.append("file", new File(["12345"], "photo.png", { type: "image/png" }));
    const response = await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "image_too_large" });
    expect(upload).not.toHaveBeenCalled();
    getBucket.mockResolvedValue({ data: { file_size_limit: 10 }, error: null });
    upload.mockResolvedValue({ error: { message: "The object exceeded the maximum allowed size", statusCode: "413" } });
    const retry = await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }));
    expect(retry.status).toBe(413);
    expect(await retry.json()).toEqual({ error: "image_too_large" });
  });
});
