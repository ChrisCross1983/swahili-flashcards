export const CARD_LIBRARY_PAGE_SIZE = 50;

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
