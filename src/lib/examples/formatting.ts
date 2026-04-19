export type ExampleSegment = {
    text: string;
    style: "plain" | "bold" | "underline" | "mark";
};

const MARKERS = [
    { token: "**", style: "bold" as const },
    { token: "__", style: "underline" as const },
    { token: "==", style: "mark" as const },
];

export function sanitizeExampleMarkup(value: string): string {
    return String(value ?? "")
        .replace(/</g, "")
        .replace(/>/g, "")
        .trim();
}

export function wrapSelectionWithMarker(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    marker: "**" | "__" | "==",
): { value: string; selectionStart: number; selectionEnd: number } {
    const input = String(value ?? "");
    const start = Math.max(0, Math.min(selectionStart, input.length));
    const end = Math.max(start, Math.min(selectionEnd, input.length));
    const selected = input.slice(start, end);
    const next = `${input.slice(0, start)}${marker}${selected}${marker}${input.slice(end)}`;
    return {
        value: next,
        selectionStart: start + marker.length,
        selectionEnd: end + marker.length,
    };
}

export function parseExampleMarkup(value: string): ExampleSegment[] {
    const input = String(value ?? "");
    if (!input) return [];

    const segments: ExampleSegment[] = [];
    let index = 0;

    while (index < input.length) {
        let nextMarker: { token: string; style: "bold" | "underline" | "mark"; at: number } | null = null;

        for (const marker of MARKERS) {
            const at = input.indexOf(marker.token, index);
            if (at === -1) continue;
            if (!nextMarker || at < nextMarker.at) {
                nextMarker = { ...marker, at };
            }
        }

        if (!nextMarker) {
            segments.push({ text: input.slice(index), style: "plain" });
            break;
        }

        if (nextMarker.at > index) {
            segments.push({ text: input.slice(index, nextMarker.at), style: "plain" });
        }

        const contentStart = nextMarker.at + nextMarker.token.length;
        const closeAt = input.indexOf(nextMarker.token, contentStart);
        if (closeAt === -1) {
            segments.push({ text: input.slice(nextMarker.at), style: "plain" });
            break;
        }

        const markedText = input.slice(contentStart, closeAt);
        if (markedText.length === 0) {
            segments.push({ text: nextMarker.token, style: "plain" });
        } else {
            segments.push({ text: markedText, style: nextMarker.style });
        }

        index = closeAt + nextMarker.token.length;
    }

    return segments;
}
