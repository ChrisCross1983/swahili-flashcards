import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  supabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: authMocks.supabaseServer,
}));

import { requireUser } from "@/lib/api/auth";

describe("requireUser", () => {
  beforeEach(() => {
    authMocks.getUser.mockReset();
    authMocks.supabaseServer.mockReset();
    authMocks.supabaseServer.mockResolvedValue({
      auth: { getUser: authMocks.getUser },
    });
  });

  it("performs exactly one verified Supabase user lookup", async () => {
    const lifecycle: string[] = [];
    authMocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    await expect(requireUser({
      onClientPreparationStarted: () => lifecycle.push("client-start"),
      onClientPreparationCompleted: () => lifecycle.push("client-complete"),
      onUserLookupStarted: () => lifecycle.push("lookup-start"),
      onUserLookupCompleted: () => lifecycle.push("lookup-complete"),
    })).resolves.toMatchObject({
      user: { id: "user-1" },
      response: null,
    });
    expect(authMocks.supabaseServer).toHaveBeenCalledOnce();
    expect(authMocks.getUser).toHaveBeenCalledOnce();
    expect(lifecycle).toEqual([
      "client-start",
      "client-complete",
      "lookup-start",
      "lookup-complete",
    ]);
  });

  it("keeps failed token validation unauthorized", async () => {
    authMocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid session"),
    });

    const result = await requireUser();

    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(401);
    await expect(result.response?.json()).resolves.toEqual({
      error: "Unauthorized",
      code: "auth_required",
      authFailureType: "invalid_session",
    });
    expect(result.authFailureType).toBe("invalid_session");
    expect(authMocks.getUser).toHaveBeenCalledOnce();
  });

  it("classifies a temporary auth transport failure without exposing details", async () => {
    authMocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("fetch failed: network timeout"),
    });
    const result = await requireUser();
    expect(result.authFailureType).toBe("auth_network_error");
    await expect(result.response?.json()).resolves.toEqual({
      error: "Unauthorized",
      code: "auth_required",
      authFailureType: "auth_network_error",
    });
  });
});
