/** Card images are storage object keys, never remote URLs. */
export function isOwnedCardImagePath(value: unknown, ownerId: string): value is string {
  return typeof value === "string" &&
    value.startsWith(`${ownerId}/`) &&
    new RegExp(`^[a-f0-9-]{36}\\.(?:png|jpe?g|webp)$`, "i").test(value.slice(ownerId.length + 1));
}
