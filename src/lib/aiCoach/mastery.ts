/**
 * Minimal server-side mastery store per card.
 * Uses userId-derived owner_key, reads/upserts rolling learning stats,
 * and computes a 0..4 mastery level for policy decisions.
 */
import { supabaseServer } from "@/lib/supabaseServer";
import type { AiTaskType } from "./types";

export type CardMastery = {
    owner_key: string;
    card_id: string;
    seen_count: number;
    correct_count: number;
    wrong_count: number;
    avg_score: number;
    streak: number;
    last_seen_at: string | null;
    last_task_type: AiTaskType | null;
    updated_at?: string;
};

export async function readMastery(userId: string, cardId: string): Promise<CardMastery | null> {
    const { data, error } = await supabaseServer
        .from("ai_card_mastery")
        .select("owner_key, card_id, seen_count, correct_count, wrong_count, avg_score, streak, last_seen_at, last_task_type, updated_at")
        .eq("owner_key", userId)
        .eq("card_id", cardId)
        .maybeSingle();

    if (error || !data) return null;
    return {
        owner_key: data.owner_key,
        card_id: data.card_id,
        seen_count: Number(data.seen_count ?? 0),
        correct_count: Number(data.correct_count ?? 0),
        wrong_count: Number(data.wrong_count ?? 0),
        avg_score: Number(data.avg_score ?? 0),
        streak: Number(data.streak ?? 0),
        last_seen_at: data.last_seen_at ?? null,
        last_task_type: data.last_task_type ?? null,
        updated_at: data.updated_at,
    };
}

export async function upsertMastery(
    userId: string,
    cardId: string,
    patch: Partial<Omit<CardMastery, "owner_key" | "card_id">>,
): Promise<CardMastery | null> {
    const payload = {
        owner_key: userId,
        card_id: cardId,
        updated_at: new Date().toISOString(),
        ...patch,
    };

    const { data, error } = await supabaseServer
        .from("ai_card_mastery")
        .upsert(payload, { onConflict: "owner_key,card_id" })
        .select("owner_key, card_id, seen_count, correct_count, wrong_count, avg_score, streak, last_seen_at, last_task_type, updated_at")
        .maybeSingle();

    if (error || !data) return null;
    return {
        owner_key: data.owner_key,
        card_id: data.card_id,
        seen_count: Number(data.seen_count ?? 0),
        correct_count: Number(data.correct_count ?? 0),
        wrong_count: Number(data.wrong_count ?? 0),
        avg_score: Number(data.avg_score ?? 0),
        streak: Number(data.streak ?? 0),
        last_seen_at: data.last_seen_at ?? null,
        last_task_type: data.last_task_type ?? null,
        updated_at: data.updated_at,
    };
}

export function computeMasteryLevel(mastery?: Pick<CardMastery, "seen_count" | "avg_score" | "streak"> | null): 0 | 1 | 2 | 3 | 4 {
    if (!mastery || mastery.seen_count <= 0) return 0;
    const seen = mastery.seen_count;
    const score = mastery.avg_score;
    const streak = mastery.streak;

    if (seen >= 12 && score >= 0.92 && streak >= 6) return 4;
    if (seen >= 8 && score >= 0.82 && streak >= 4) return 3;
    if (seen >= 4 && score >= 0.68) return 2;
    if (seen >= 2 && score >= 0.5) return 1;
    return 0;
}
