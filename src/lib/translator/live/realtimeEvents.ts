export type TranslationServerEvent = {
  type: string;
  delta?: string;
  elapsed_ms?: number;
  error?: { code?: string; type?: string };
};

export function parseTranslationServerEvent(data: unknown): TranslationServerEvent | null {
  if (typeof data !== "string") return null;
  try {
    const value = JSON.parse(data) as { type?: unknown };
    return typeof value.type === "string" ? (value as TranslationServerEvent) : null;
  } catch {
    return null;
  }
}
