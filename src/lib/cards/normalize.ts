export function normalizeCardText(value: string) {
    return value
        .trim()
        .replace(/^['"“”„]+|['"“”„]+$/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();
}
