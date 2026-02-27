type CardOption = { id: string; answer: string };

function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function buildMcqChoices(correctAnswer: string, candidates: CardOption[]): string[] {
    const normalizedCorrect = correctAnswer.trim().toLowerCase();
    const uniqueDistractors = Array.from(new Set(
        candidates
            .map((candidate) => candidate.answer.trim())
            .filter((answer) => answer && answer.toLowerCase() !== normalizedCorrect)
    ));

    const pickedDistractors = shuffle(uniqueDistractors).slice(0, 3);
    const options = shuffle([correctAnswer, ...pickedDistractors]);

    if (options.length < 4) {
        const fill = ["sijui", "asante", "rafiki", "chakula"].filter((item) => !options.includes(item));
        return [...options, ...fill].slice(0, 4);
    }

    return options;
}
