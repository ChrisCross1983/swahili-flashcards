export const CARD_LIBRARY_PAGE_SIZE = 50;

export type LibrarySortOrder = "recent" | "az" | "za";

export function filterAndSortLibraryCards<T extends { german_text?: string | null; swahili_text?: string | null; groups?: Array<{ id: string | number }> }>(
    cards: T[], query: string, groupIds: string[], sortOrder: LibrarySortOrder
): T[] {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const filtered = cards.filter((card) => {
        if (groupIds.length && !groupIds.some((id) => card.groups?.some((group) => String(group.id) === id))) return false;
        const text = `${card.german_text ?? ""} ${card.swahili_text ?? ""}`.toLocaleLowerCase().replace(/\s+/g, " ");
        return terms.every((term) => text.includes(term));
    });
    if (sortOrder === "recent") return filtered;
    return filtered.sort((a, b) => (a.german_text ?? "").localeCompare(b.german_text ?? "", "de", { sensitivity: "base" }) * (sortOrder === "az" ? 1 : -1));
}

export function getVisibleCards<T>(cards: T[], visibleCount: number): T[] {
    return cards.slice(0, Math.max(0, visibleCount));
}

export function shouldShowLoadMore(total: number, visibleCount: number): boolean {
    return total > Math.max(0, visibleCount);
}

export function nextVisibleCount(current: number, pageSize: number, total: number): number {
    return Math.min(Math.max(0, current) + Math.max(1, pageSize), Math.max(0, total));
}

export function getLibraryCountLabel(params: {
    visible: number;
    total: number;
    filtered: boolean;
    itemLabel?: string;
}): string {
    const itemLabel = params.itemLabel ?? "Karten";
    const visible = Math.min(Math.max(0, params.visible), Math.max(0, params.total));
    const total = Math.max(0, params.total);
    return params.filtered
        ? `${visible} von ${total} passenden ${itemLabel} angezeigt`
        : `${visible} von ${total} ${itemLabel} angezeigt`;
}
