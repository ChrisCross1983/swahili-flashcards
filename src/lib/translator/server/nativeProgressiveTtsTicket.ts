import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { TranslationLanguage } from "@/lib/translator/types";

export const NATIVE_TTS_TICKET_TTL_SECONDS = 120;
export const NATIVE_TTS_COOKIE_PATH = "/api/translator/speech/native";

export type NativeTtsTicket = {
  id: string;
  userId: string;
  text: string;
  language: TranslationLanguage;
  speed: number;
  expiresAt: number;
};

export function nativeTtsCookieName(id: string) {
  return `classic_native_tts_${id}`;
}

export function nativeTtsDiagnosticCookieName(id: string) {
  return `classic_native_tts_first_${id}`;
}

export function newNativeTtsMediaId() {
  return randomBytes(18).toString("base64url");
}

export function validNativeTtsMediaId(value: string) {
  return /^[A-Za-z0-9_-]{24}$/.test(value);
}

function keyFromEnvironment() {
  const configured = process.env.CLASSIC_NATIVE_TTS_COOKIE_KEY;
  if (!configured) return null;
  const key = Buffer.from(configured, "base64");
  return key.length === 32 ? key : null;
}

export function sealNativeTtsTicket(ticket: NativeTtsTicket) {
  const key = keyFromEnvironment();
  if (!key) throw new Error("Native TTS ticket key unavailable");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(ticket), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openNativeTtsTicket(value: string | undefined, id: string, userId: string): NativeTtsTicket | null {
  const key = keyFromEnvironment();
  if (!key || !value || !validNativeTtsMediaId(id)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const raw = Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    const ticket = JSON.parse(raw) as Partial<NativeTtsTicket>;
    if (ticket.id !== id || ticket.userId !== userId ||
        typeof ticket.expiresAt !== "number" || ticket.expiresAt <= Date.now() ||
        typeof ticket.text !== "string" || ticket.text.length === 0 || ticket.text.length > 4_000 ||
        (ticket.language !== "de" && ticket.language !== "sw") ||
        typeof ticket.speed !== "number" || !Number.isFinite(ticket.speed)) return null;
    return ticket as NativeTtsTicket;
  } catch {
    return null;
  }
}

export function privateNativeTtsCookie(name: string, value: string) {
  return `${name}=${value}; Path=${NATIVE_TTS_COOKIE_PATH}; Max-Age=${NATIVE_TTS_TICKET_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function getRequestCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const index = cookie.indexOf("=");
    if (index < 0 || cookie.slice(0, index).trim() !== name) continue;
    return cookie.slice(index + 1).trim();
  }
  return undefined;
}
