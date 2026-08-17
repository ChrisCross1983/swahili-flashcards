import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/supabaseServer", () => ({
  supabaseServer: {
    from: fromMock,
  },
}));

function createUpdateQuery(error: { message: string } | null = null) {
  const query = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve: (value: { error: { message: string } | null }) => void) => resolve({ error }),
  };
  return query;
}

async function post(body: unknown) {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/migrate", {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

describe("/api/migrate", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    fromMock.mockReset();
  });

  it("rejects unauthenticated requests before service-role writes", async () => {
    requireUserMock.mockResolvedValue({
      user: null,
      response: NextResponseJson({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await post({ fromKey: "legacy-owner", toKey: "user-1" });

    expect(response.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a request that tries to choose another target owner", async () => {
    requireUserMock.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });

    const response = await post({ fromKey: "legacy-owner", toKey: "user-2" });

    expect(response.status).toBe(403);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uses the authenticated user as migration target", async () => {
    requireUserMock.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
    const cardQuery = createUpdateQuery();
    const progressQuery = createUpdateQuery();
    fromMock
      .mockReturnValueOnce(cardQuery)
      .mockReturnValueOnce(progressQuery);

    const response = await post({ fromKey: "legacy-owner", toKey: "user-1" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(fromMock).toHaveBeenNthCalledWith(1, "cards");
    expect(fromMock).toHaveBeenNthCalledWith(2, "card_progress");
    expect(cardQuery.update).toHaveBeenCalledWith({ owner_key: "user-1" });
    expect(progressQuery.update).toHaveBeenCalledWith({ owner_key: "user-1" });
    expect(cardQuery.eq).toHaveBeenCalledWith("owner_key", "legacy-owner");
    expect(progressQuery.eq).toHaveBeenCalledWith("owner_key", "legacy-owner");
  });
});

function NextResponseJson(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}
