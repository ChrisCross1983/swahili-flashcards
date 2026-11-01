import { describe, expect, it, vi } from "vitest";

const { requireUser, from } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));
import { POST, PATCH } from "./route";

describe("card image path boundary", () => {
  const owner = "123e4567-e89b-12d3-a456-426614174111";
  const image = `${owner}/123e4567-e89b-12d3-a456-426614174000.webp`;
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
});
