export function hashToUnit(seed: string): number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10_000) / 10_000;
}

export function pickBoundedIndex(length: number, seed: string, window = 3): number {
    if (length <= 1) return 0;
    const bounded = Math.min(length, Math.max(1, window));
    const offset = Math.floor(hashToUnit(seed) * bounded);
    return Math.min(length - 1, offset);
}

export function rotateDeterministic<T>(items: T[], seed: string): T[] {
    if (items.length <= 1) return items;
    const idx = pickBoundedIndex(items.length, seed, items.length);
    return [...items.slice(idx), ...items.slice(0, idx)];
}
