export function cleanGroupName(value: string): string {
    return value.trim().replace(/\s+/g, " ");
}

export function normalizeGroupName(value: string): string {
    return cleanGroupName(value).normalize("NFKC").toLocaleLowerCase("de");
}

export function isGroupNameConflict(error: { code?: string } | null): boolean {
    return error?.code === "23505";
}
