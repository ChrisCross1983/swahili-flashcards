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

  it("returns a safe 503 and logs only diagnostic metadata when bucket lookup fails", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    getBucket.mockResolvedValue({ data: null, error: { status: 404, statusCode: "BucketNotFound", message: "private upstream detail" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "image_policy_unavailable" });
      expect(log).toHaveBeenCalledWith("[upload-image] storage unavailable", {
        stage: "policy", reason: "bucket_not_found", code: "BucketNotFound", httpStatus: 404,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private upstream detail");
    } finally {
      log.mockRestore();
    }
  });
  it("does not try an upload when the configured bucket cannot be checked", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    getBucket.mockResolvedValue({ data: null, error: { code: "BucketNotFound", message: "private detail" } });
    upload.mockClear();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const form = new FormData();
      form.append("file", new File(["image"], "untrusted.name", { type: "image/webp" }));
      const response = await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }));
      expect(response.status).toBe(503);
      expect(upload).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("private detail");
    } finally { log.mockRestore(); }
  });
  it("logs only safe storage metadata and keeps upstream errors out of responses", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    getBucket.mockResolvedValue({ data: { file_size_limit: null }, error: null });
    upload.mockResolvedValue({ error: { status: 403, statusCode: "AccessDenied", message: "sensitive storage detail" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const form = new FormData();
      form.append("file", new File(["image"], "untrusted.name", { type: "image/webp" }));
      const response = await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "image_upload_failed" });
      expect(upload.mock.calls.at(-1)?.[0]).toMatch(/^owner-1\/[a-f0-9-]{36}\.webp$/);
      expect(log).toHaveBeenCalledWith("[upload-image] storage unavailable", { stage: "upload", reason: "storage_permission_denied", code: "AccessDenied", httpStatus: 403 });
      expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive storage detail");
    } finally { log.mockRestore(); }
  });

  it("distinguishes missing user authentication without logging identity data", async () => {
    requireUser.mockResolvedValue({ user: null, response: new Response(null, { status: 401 }), authFailureType: "missing_session" });
    upload.mockClear();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await POST(new Request("http://localhost/api/upload-image", { method: "POST" }));
      expect(response.status).toBe(401);
      expect(upload).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("[upload-image] request rejected", { reason: "auth_required", authFailureType: "missing_session" });
    } finally { warn.mockRestore(); }
  });

  it("classifies missing configuration and an unreachable bucket without logging raw errors", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    const previousBucket = process.env.SUPABASE_STORAGE_BUCKET;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      delete process.env.SUPABASE_STORAGE_BUCKET;
      expect((await GET()).status).toBe(503);
      expect(log).toHaveBeenLastCalledWith("[upload-image] storage unavailable", { stage: "policy", reason: "missing_bucket_config", code: undefined, httpStatus: undefined });
      process.env.SUPABASE_STORAGE_BUCKET = "card-images";
      getBucket.mockRejectedValue(new TypeError("fetch failed; private endpoint"));
      expect((await GET()).status).toBe(503);
      expect(log).toHaveBeenLastCalledWith("[upload-image] storage unavailable", { stage: "policy", reason: "bucket_unreachable", code: undefined, httpStatus: undefined });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private endpoint");
    } finally {
      if (previousBucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
      else process.env.SUPABASE_STORAGE_BUCKET = previousBucket;
      log.mockRestore();
    }
  });

  it.each([
    [{ status: 401, statusCode: "Unauthorized", message: "private auth detail" }, "storage_auth_rejected", "Unauthorized"],
    [{ status: 400, statusCode: "InvalidKey", message: "private object path" }, "invalid_upload_path", "InvalidKey"],
    [{ status: 500, statusCode: "InternalServerError", message: "private upstream detail" }, "upload_failed", undefined],
    [{ status: 400, statusCode: "unexpected-private-code", message: "private storage detail" }, "storage_other", undefined],
  ])("classifies a storage upload failure as %s without leaking details", async (storageError, reason, code) => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    getBucket.mockResolvedValue({ data: { file_size_limit: null }, error: null });
    upload.mockResolvedValue({ error: storageError });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const form = new FormData();
      form.append("file", new File(["image"], "safe.webp", { type: "image/webp" }));
      const response = await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }));
      expect(response.status).toBe(500);
      expect(log).toHaveBeenCalledWith("[upload-image] storage unavailable", {
        stage: "upload", reason, code, httpStatus: storageError.status,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(storageError.message);
    } finally { log.mockRestore(); }
  });

  it("labels a thrown upload transport error without exposing its endpoint", async () => {
    requireUser.mockResolvedValue({ user: { id: "owner-1" }, response: null });
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    getBucket.mockResolvedValue({ data: { file_size_limit: null }, error: null });
    upload.mockRejectedValue(new TypeError("fetch failed; private endpoint"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const form = new FormData();
      form.append("file", new File(["image"], "safe.webp", { type: "image/webp" }));
      const response = await POST(new Request("http://localhost/api/upload-image", { method: "POST", body: form }));
      expect(response.status).toBe(503);
      expect(log).toHaveBeenCalledWith("[upload-image] storage unavailable", { stage: "upload", reason: "upload_transport_failed", code: undefined, httpStatus: undefined });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private endpoint");
    } finally { log.mockRestore(); }
  });
});
