import { describe, expect, it, vi } from "vitest";

const { requireUser, from, remove } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from, storage: { from: () => ({ remove }) } } }));
import { POST, PATCH } from "./route";

type ImageSelectQuery = {
  eq: () => ImageSelectQuery;
  single: () => Promise<{ data: Record<string, unknown>; error: null }>;
  limit: () => Promise<{ data: never[]; error: null }>;
};

describe("card image path boundary", () => {
  const owner = "123e4567-e89b-12d3-a456-426614174111";
  const image = `${owner}/123e4567-e89b-12d3-a456-426614174000.webp`;
  const oldImage = `${owner}/123e4567-e89b-12d3-a456-426614174222.webp`;
  const request = (method: string, body: unknown) => new Request("http://localhost/api/cards", {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  it("rejects remote URLs on create and update before database access", async () => {
    requireUser.mockResolvedValue({ user: { id: owner }, response: null });
    from.mockClear();
    expect((await POST(request("POST", { german: "Katze", swahili: "paka", imagePath: "https://example.com/cat.jpg" }))).status).toBe(400);
    expect((await PATCH(request("PATCH", { id: "card-1", imagePath: "https://example.com/cat.jpg" }))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("accepts an owned internal image path and cards without images", async () => {
    requireUser.mockResolvedValue({ user: { id: owner }, response: null });
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "card-1" }, error: null }) }) });
    from.mockImplementation((table: string) => table === "cards" ? { insert } : { insert: async () => ({ error: null }) });
    expect((await POST(request("POST", { german: "Katze", swahili: "paka", imagePath: image }))).status).toBe(200);
    expect(insert.mock.calls[0][0].image_path).toBe(image);
    expect((await POST(request("POST", { german: "Hund", swahili: "mbwa" }))).status).toBe(200);
    expect(insert.mock.calls[1][0].image_path).toBeNull();
  });

  it("removes the previous image only after a successful card update", async () => {
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    requireUser.mockResolvedValue({ user: { id: owner }, response: null });
    remove.mockReset().mockResolvedValue({ error: null });
    const existing = { type: "vocab", german_text: "Katze", swahili_text: "paka", image_path: oldImage };
    let selectCount = 0;
    from.mockReturnValue({
      select: () => {
        selectCount++;
        const query: ImageSelectQuery = { eq: () => query, single: async () => ({ data: existing, error: null }), limit: async () => ({ data: [], error: null }) };
        return query;
      },
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: "card-1", image_path: image }, error: null }) }) }) }) }),
    });
    const response = await PATCH(request("PATCH", { id: "card-1", imagePath: image }));
    expect(response.status).toBe(200);
    expect(selectCount).toBe(2);
    expect(remove).toHaveBeenCalledWith([oldImage]);
  });

  it("rolls back the new image and keeps the old object when the DB update fails", async () => {
    process.env.SUPABASE_STORAGE_BUCKET = "card-images";
    requireUser.mockResolvedValue({ user: { id: owner }, response: null });
    remove.mockReset().mockResolvedValue({ error: null });
    const existing = { type: "vocab", german_text: "Katze", swahili_text: "paka", image_path: oldImage };
    from.mockReturnValue({
      select: () => {
        const query: ImageSelectQuery = { eq: () => query, single: async () => ({ data: existing, error: null }), limit: async () => ({ data: [], error: null }) };
        return query;
      },
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "db_down" } }) }) }) }) }),
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await PATCH(request("PATCH", { id: "card-1", imagePath: image }));
      expect(response.status).toBe(500);
      expect(remove).toHaveBeenCalledWith([image]);
      expect(remove).not.toHaveBeenCalledWith([oldImage]);
    } finally { log.mockRestore(); }
  });
});
