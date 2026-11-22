import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), inserted: [] as Record<string, unknown>[] }));
vi.mock("@/lib/api/auth", () => ({ requireUser: fixture.auth }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from: fixture.from } }));
vi.mock("@/lib/diagnostics/server", () => ({ withServerDiagnostics: (_route: string, handler: (req: Request, diagnostics: { setUser: () => void; setRunId: () => void; supabaseFailure: () => void }) => Promise<Response>) => (req: Request) => handler(req, { setUser: () => {}, setRunId: () => {}, supabaseFailure: () => {} }) }));

import { POST } from "./route";

const userId = "a01fb325-6ab7-423e-beb3-27642e19b14f";
const runId = "b01fb325-6ab7-423e-beb3-27642e19b14f";
const request = () => new Request("https://app.test/api/learn/sessions", { method: "POST", headers: { "x-diagnostics-run-id": runId },
    body: JSON.stringify({ mode: "LEITNER", totalCount: 12, correctCount: 10, wrongCardIds: ["card-a", "card-b"] }) });

beforeEach(() => {
    fixture.inserted.length = 0;
    fixture.auth.mockReset().mockResolvedValue({ user: { id: userId }, response: null });
    fixture.from.mockReset().mockImplementation(() => ({ insert: async (row: Record<string, unknown>) => {
        fixture.inserted.push(row);
        return { error: fixture.inserted.length === 1 ? null : { code: "23505", message: "duplicate" } };
    }, select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { diagnostic_run_id: runId }, error: null }) }) }) }) }));
});

describe("learning session idempotency", () => {
    it("uses the authenticated owner and treats the same run retry as already saved", async () => {
        expect((await POST(request())).status).toBe(200);
        const retry = await POST(request());
        expect(retry.status).toBe(200);
        expect(await retry.json()).toMatchObject({ alreadySaved: true });
        expect(fixture.inserted[0]).toMatchObject({ owner_key: userId, diagnostic_run_id: runId, total_count: 12 });
    });
});
