import { createHmac, timingSafeEqual } from "node:crypto";
import { hasWordUnderstanding, type WordEnrichment } from "@/lib/word/understanding";

const TTL_MS = 20 * 60_000;

function key(): Buffer {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error("preview_signing_unavailable");
    return createHmac("sha256", secret).update("word-enrichment-preview-v1").digest();
}

function signature(body: string): Buffer {
    return createHmac("sha256", key()).update(body).digest();
}

export function signWordPreview(userId: string, cardId: string, enrichment: WordEnrichment, now = Date.now()): string {
    const body = Buffer.from(JSON.stringify({ userId, cardId, expiresAt: now + TTL_MS, enrichment })).toString("base64url");
    return `${body}.${signature(body).toString("base64url")}`;
}

export function verifyWordPreview(token: string, userId: string, cardId: string, now = Date.now()): WordEnrichment | null {
    if (token.length > 16_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
    const [body, mac] = token.split(".");
    const received = Buffer.from(mac, "base64url");
    const expected = signature(body);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    try {
        const claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        if (claim.userId !== userId || claim.cardId !== cardId || !Number.isSafeInteger(claim.expiresAt)
            || claim.expiresAt < now || claim.expiresAt > now + TTL_MS || !hasWordUnderstanding(claim.enrichment)) return null;
        return claim.enrichment;
    } catch { return null; }
}
