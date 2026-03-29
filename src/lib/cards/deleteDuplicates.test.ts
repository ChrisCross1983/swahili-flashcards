import { describe, expect, it, vi } from "vitest";
import { __internal, deleteUserDuplicateCards } from "./deleteDuplicates";

type FakeRow = { id: string };

function createSupabaseFake(params: {
    ownedIds?: string[];
    requiredErrors?: Record<string, { code?: string; message?: string }>;
    optionalErrors?: Record<string, { code?: string; message?: string }>;
    cardsDeleteError?: { code?: string; message?: string };
    ownershipError?: { code?: string; message?: string };
}) {
    const ownedIds = params.ownedIds ?? [];

    return {
        from(table: string) {
            return {
                select() {
                    return {
                        eq() {
                            return {
                                async in() {
                                    if (table === "cards" && params.ownershipError) {
                                        return { data: null, error: params.ownershipError };
                                    }
                                    if (table === "cards") {
                                        return { data: ownedIds.map((id) => ({ id })) as FakeRow[], error: null };
                                    }
                                    return { data: [], error: null };
                                },
                            };
                        },
                    };
                },
                delete() {
                    return {
                        eq() {
                            return {
                                async in() {
                                    if (table === "cards") {
                                        return { error: params.cardsDeleteError ?? null };
                                    }

                                    if (__internal.REQUIRED_TABLES.includes(table)) {
                                        return { error: params.requiredErrors?.[table] ?? null };
                                    }

                                    if (__internal.OPTIONAL_TABLES.includes(table)) {
                                        return { error: params.optionalErrors?.[table] ?? null };
                                    }

                                    return { error: null };
                                },
                            };
                        },
                    };
                },
            };
        },
    };
}

describe("deleteUserDuplicateCards", () => {
    it("continues when optional table is missing", async () => {
        const supabase = createSupabaseFake({
            ownedIds: ["1", "2"],
            optionalErrors: {
                ai_learner_state: { code: "PGRST205", message: "Could not find the table 'public.ai_learner_state' in the schema cache" },
            },
        });
        const logger = { warn: vi.fn(), error: vi.fn() };

        const result = await deleteUserDuplicateCards({ supabase, userId: "user-1", cardIds: ["1", "2"], logger });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.deletedCount).toBe(2);
            expect(result.warnings).toHaveLength(1);
        }
        expect(logger.warn).toHaveBeenCalled();
    });

    it("fails on required cleanup errors", async () => {
        const supabase = createSupabaseFake({
            ownedIds: ["1"],
            requiredErrors: {
                card_progress: { message: "permission denied" },
            },
        });

        const result = await deleteUserDuplicateCards({ supabase, userId: "user-1", cardIds: ["1"] });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(500);
            expect(result.error).toContain("card_progress");
        }
    });

    it("enforces ownership before deleting", async () => {
        const supabase = createSupabaseFake({
            ownedIds: ["1"],
        });

        const result = await deleteUserDuplicateCards({ supabase, userId: "user-1", cardIds: ["1", "2"] });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(403);
        }
    });

    it("detects missing-table errors", () => {
        expect(__internal.isMissingTableError({ code: "PGRST205", message: "not found" })).toBe(true);
        expect(__internal.isMissingTableError({ code: "42P01", message: "relation does not exist" })).toBe(true);
        expect(__internal.isMissingTableError({ message: "permission denied" })).toBe(false);
    });
});
