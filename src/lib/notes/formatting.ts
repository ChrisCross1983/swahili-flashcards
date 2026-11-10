export type NoteStyle = "plain" | "bold" | "italic" | "underline";

const markers = [{ token: "**", style: "bold" }, { token: "__", style: "underline" }, { token: "*", style: "italic" }] as const;

export function parseNoteMarkup(value: string): Array<{ text: string; style: NoteStyle }> {
    const result: Array<{ text: string; style: NoteStyle }> = [];
    let rest = value;
    while (rest) {
        const next = markers.map((marker) => ({ ...marker, index: rest.indexOf(marker.token) }))
            .filter((marker) => marker.index >= 0)
            .sort((a, b) => a.index - b.index || b.token.length - a.token.length)[0];
        if (!next) { result.push({ text: rest, style: "plain" }); break; }
        if (next.index) result.push({ text: rest.slice(0, next.index), style: "plain" });
        const end = rest.indexOf(next.token, next.index + next.token.length);
        if (end < 0 || end === next.index + next.token.length) {
            result.push({ text: rest.slice(next.index, next.index + next.token.length), style: "plain" });
            rest = rest.slice(next.index + next.token.length);
        } else {
            result.push({ text: rest.slice(next.index + next.token.length, end), style: next.style });
            rest = rest.slice(end + next.token.length);
        }
    }
    return result;
}

export function wrapNoteSelection(value: string, start: number, end: number, marker: "**" | "*" | "__") {
    const selection = value.slice(start, end);
    if (start === end) return { value: value.slice(0, start) + marker + marker + value.slice(end), start: start + marker.length, end: start + marker.length };
    const wrapped = selection.startsWith(marker) && selection.endsWith(marker)
        ? selection.slice(marker.length, -marker.length)
        : `${marker}${selection}${marker}`;
    return { value: value.slice(0, start) + wrapped + value.slice(end), start, end: start + wrapped.length };
}
