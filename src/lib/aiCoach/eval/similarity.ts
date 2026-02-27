export function normalizeText(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,!?;:()"']/g, "")
        .replace(/\s+/g, " ");
}

export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
    const curr = Array.from({ length: b.length + 1 }, () => 0);

    for (let i = 1; i <= a.length; i += 1) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }

        for (let j = 0; j <= b.length; j += 1) {
            prev[j] = curr[j];
        }
    }

    return prev[b.length];
}

export function computeSimilarityScore(answer: string, expected: string): number {
    const normalizedAnswer = normalizeText(answer);
    const normalizedExpected = normalizeText(expected);
    if (!normalizedAnswer && !normalizedExpected) return 1;
    if (!normalizedAnswer || !normalizedExpected) return 0;

    const distance = levenshtein(normalizedAnswer, normalizedExpected);
    const maxLen = Math.max(normalizedAnswer.length, normalizedExpected.length);
    return Math.max(0, 1 - distance / maxLen);
}
