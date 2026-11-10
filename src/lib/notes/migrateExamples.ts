export function mergeLegacyExamples(
    note: string | null | undefined,
    swahili: string | null | undefined,
    german: string | null | undefined,
    enrichment: Array<{ sw?: string | null; de?: string | null }> = [],
    noteExample?: string | null,
): string {
    const examples = [swahili, german, noteExample, ...enrichment.flatMap((pair) => [pair.sw, pair.de])]
        .filter((value): value is string => Boolean(value?.trim()));
    if (!examples.length) return note ?? "";
    const section = `Beispiele:\n${examples.map((example) => `- ${example}`).join("\n")}`;
    return note?.trim() ? `${note}\n\n${section}` : section;
}

export function migrateExampleRecord(input: {
    note: string;
    version: number;
    swahili?: string | null;
    german?: string | null;
    noteExample?: string | null;
    enrichment?: Array<{ sw?: string | null; de?: string | null }>;
}) {
    if (input.version >= 1) return input;
    const note = mergeLegacyExamples(input.note, input.swahili, input.german, input.enrichment, input.noteExample);
    return note === input.note ? input : { ...input, note, version: 1 };
}
