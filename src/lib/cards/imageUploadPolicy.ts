export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function imageUploadLimit(bucketLimit: number | null | undefined, globalLimit?: string): number | null {
  const configuredGlobal = globalLimit && /^\d+$/.test(globalLimit) ? Number(globalLimit) : null;
  const limits = [bucketLimit, configuredGlobal].filter((value): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0);
  return limits.length ? Math.min(...limits) : null;
}

export function imageTooLarge(size: number, maxBytes: number | null): boolean {
  return maxBytes !== null && size > maxBytes;
}

export function imageLimitLabel(maxBytes: number | null): string {
  if (maxBytes === null) return "";
  return `${Number((maxBytes / 1_000_000).toFixed(1))} MB`;
}

export function isStorageOversizeError(error: { message?: string; statusCode?: string | number; error?: string }): boolean {
  const detail = `${error.message ?? ""} ${error.error ?? ""}`.toLowerCase();
  return error.statusCode === "413" || error.statusCode === 413 || /maximum allowed size|payload too large|file size limit|entity too large/.test(detail);
}
