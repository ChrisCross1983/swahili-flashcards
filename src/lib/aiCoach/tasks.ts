import type { Direction } from "@/lib/trainer/types";
import type { AiCoachTask, AiTaskType } from "./types";

type SourceCard = {
    id: string;
    german_text: string;
    swahili_text: string;
};

type ClozeTemplate = {
    prompt: string;
    target: "CARD" | string;
    hint: string;
    hints: string[];
};

const CLOZE_TEMPLATES: ClozeTemplate[] = [
    { prompt: "Nina__ chai asubuhi.", target: "kunywa", hint: "Verb für trinken", hints: ["Infinitiv mit ku-", "Beginnt mit ku…"] },
    { prompt: "__ ni tamu sana.", target: "CARD", hint: "Etwas Essbares", hints: ["Nomen gesucht", "Es kommt aus dem Vokabelsatz"] },
    { prompt: "Leo ninaenda __.", target: "sokoni", hint: "Ort: Markt", hints: ["Ort mit -ni", "S…"] },
    { prompt: "Asubuhi ninakula __.", target: "CARD", hint: "Etwas zum Essen", hints: ["Nomen", "Aus deiner Karte"] },
    { prompt: "Yeye ni __ wangu.", target: "rafiki", hint: "Eine Person", hints: ["Freund/in", "Beginnt mit r…"] },
    { prompt: "Tunaishi __.", target: "mjini", hint: "Ort: Stadt", hints: ["Ortsform", "m…ni"] },
    { prompt: "Nina __ mpya.", target: "CARD", hint: "Ein Gegenstand", hints: ["Nomen", "Nutze das Kartenwort"] },
    { prompt: "Kesho nitasoma __.", target: "CARD", hint: "Lerninhalt", hints: ["Nomen", "aus deinem Wortschatz"] },
    { prompt: "Mtoto anapenda __.", target: "CARD", hint: "Etwas, das man mögen kann", hints: ["Nomen", "aus der Karte"] },
];

function parseAcceptedAnswers(value: string): string[] {
    return value
        .split(/[\/,]/)
        .map((part) => part.trim())
        .filter(Boolean);
}

export function buildTaskFromCard(card: SourceCard, taskType: AiTaskType, direction: Direction): AiCoachTask {
    const expectedAnswer = direction === "DE_TO_SW" ? card.swahili_text : card.german_text;
    const sourceText = direction === "DE_TO_SW" ? card.german_text : card.swahili_text;
    const acceptedAnswers = parseAcceptedAnswers(expectedAnswer);

    if (taskType === "cloze") {
        const template = CLOZE_TEMPLATES[Math.floor(Math.random() * CLOZE_TEMPLATES.length)];
        const templateAnswer = template.target === "CARD" ? acceptedAnswers[0] ?? expectedAnswer : template.target;

        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "cloze",
            direction,
            prompt: `Fülle die Lücke: ${template.prompt}`,
            expectedAnswer: templateAnswer,
            acceptedAnswers: template.target === "CARD" ? acceptedAnswers : [templateAnswer],
            hint: `Tipp: ${template.hint}`,
            hints: template.hints,
            meta: { source: "template", difficulty: "medium" },
        };
    }

    return {
        taskId: crypto.randomUUID(),
        cardId: card.id,
        type: "translate",
        direction,
        prompt: `Übersetze: ${sourceText}`,
        expectedAnswer,
        acceptedAnswers,
        hints: [`Beginnt mit ${acceptedAnswers[0]?.slice(0, 1).toUpperCase() ?? "…"}`],
        meta: { source: "vocab", difficulty: "easy" },
    };
}
