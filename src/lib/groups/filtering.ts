export function cardMatchesAnySelectedGroup(
    cardGroupIds: string[],
    selectedGroupIds: string[]
): boolean {
    if (selectedGroupIds.length === 0) return true;
    const selected = new Set(selectedGroupIds.map(String));
    return cardGroupIds.some((id) => selected.has(String(id)));
}

export function computeGroupMembershipDiff(existingGroupIds: string[], nextGroupIds: string[]) {
    const existing = new Set(existingGroupIds.map(String));
    const next = new Set(nextGroupIds.map(String));

    const toAdd = Array.from(next).filter((id) => !existing.has(id));
    const toRemove = Array.from(existing).filter((id) => !next.has(id));

    return { toAdd, toRemove };
}
