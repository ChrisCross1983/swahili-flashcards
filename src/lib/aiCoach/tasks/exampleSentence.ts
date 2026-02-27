type ExampleInput = {
    swahili: string;
    german?: string;
};

export function buildExampleSentence({ swahili, german }: ExampleInput): string {
    const word = swahili.trim();
    if (!word) return "";

    if (word.startsWith("ku")) {
        return `Leo ninajaribu ${word}.`;
    }

    if (word.endsWith("a") || word.endsWith("e")) {
        return `Ninapenda ${word} sana.`;
    }

    return german ? `Ninaona ${word} (${german}).` : `Ninaona ${word}.`;
}
