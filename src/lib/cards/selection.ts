export function toggleSelection(selected: Set<string>, cardId: string): Set<string> {
    const next = new Set(selected);
    if (next.has(cardId)) next.delete(cardId);
    else next.add(cardId);
    return next;
}

export function selectAllVisible(visibleCardIds: string[]): Set<string> {
    return new Set(visibleCardIds);
}

export function clearSelection(): Set<string> {
    return new Set();
}

export function removeDeletedFromSelection(selected: Set<string>, deletedCardIds: Iterable<string>): Set<string> {
    const deleted = new Set(deletedCardIds);
    const next = new Set<string>();
    selected.forEach((id) => {
        if (!deleted.has(id)) next.add(id);
    });
    return next;
}
