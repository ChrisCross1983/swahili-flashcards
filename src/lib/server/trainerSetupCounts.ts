import { supabaseServer } from "@/lib/supabaseServer";
import type { CardType, SetupCounts } from "@/lib/trainer/types";

type SetupCountsRpcRow = {
    today_due?: number | string | null;
    total_cards?: number | string | null;
    last_missed_count?: number | string | null;
};

type SetupCountsRpcError = {
    code?: string;
    message?: string;
    status?: number;
};

export class TrainerSetupCountsRpcError extends Error {
    constructor(
        readonly code: string | undefined,
        readonly status: number | undefined,
    ) {
        super("Trainer setup counts RPC failed");
    }
}

function normalizeCount(value: number | string | null | undefined) {
    const count = Number(value ?? 0);
    return Number.isFinite(count) && count >= 0 ? count : 0;
}

function utcToday() {
    return new Date().toISOString().slice(0, 10);
}

// The caller must have already performed an authoritative server-side user
// check. This function deliberately accepts only that verified owner key and
// never reads cookies or session data itself.
export async function getTrainerSetupCountsForUser(
    ownerKey: string,
    cardType: CardType | null,
    today = utcToday(),
): Promise<SetupCounts> {
    const client = supabaseServer as unknown as {
        rpc?: (name: string, args: Record<string, string | null>) => Promise<{
            data: SetupCountsRpcRow[] | null;
            error: SetupCountsRpcError | null;
        }>;
    };
    if (typeof client.rpc !== "function") {
        throw new TrainerSetupCountsRpcError(undefined, undefined);
    }

    const { data, error } = await client.rpc("trainer_setup_counts", {
        p_owner_key: ownerKey,
        p_card_type: cardType,
        p_today: today,
    });
    if (error) throw new TrainerSetupCountsRpcError(error.code, error.status);

    const row = data?.[0];
    if (!row) throw new TrainerSetupCountsRpcError(undefined, undefined);

    return {
        todayDue: normalizeCount(row.today_due),
        totalCards: normalizeCount(row.total_cards),
        lastMissedCount: normalizeCount(row.last_missed_count),
    };
}
