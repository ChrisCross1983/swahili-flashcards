import type { Direction } from "@/lib/trainer/types";
import { buildHintLevels } from "./hintEngine";
import { rankDistractorsByPedagogicalFit, type ChoiceCandidate } from "./policy";
import type { AiCoachTask } from "./types";
import type { SourceCard } from "./tasks/generate";

const GENERIC_HINT = [
    /fokussiere dich/i,
    /kernbegriff/i,
    /wenn unsicher/i,
    /denk zuerst an die bedeutung/i,
    /sprich die antwort laut/i,
];

function normalize(text: string): string {
    return text.trim().toLowerCase();
}

function detectLanguage(text: string): "de" | "sw" | "unknown" {
    const t = normalize(text);
    if (!t) return "unknown";
    if (/[äöüß]/.test(t) || /\b(der|die|das|ein|eine|nicht|ist|und|mit|für|haus|fenster|stuhl|buch|freund|markt|straße)\b/.test(t)) return "de";
    if (/\b(ni|kwa|na|ya|wa|hii|asante|sana|habari)\b/.test(t)) return "sw";
    return "unknown";
}

export function validateMcqChoices(task: AiCoachTask, direction: Direction): { ok: boolean; reason?: string } {
    if (task.type !== "mcq") return { ok: true };
    const choices = task.choices ?? [];
    if (choices.length < 4) return { ok: false, reason: "not_enough_choices" };
    if (!choices.some((choice) => normalize(choice) === normalize(task.expectedAnswer))) return { ok: false, reason: "missing_correct_answer" };

    const expectedLanguage = direction === "DE_TO_SW" ? "sw" : "de";
    const distractors = choices.filter((choice) => normalize(choice) !== normalize(task.expectedAnswer));
    if (distractors.some((item) => {
        const lang = detectLanguage(item);
        return lang !== "unknown" && lang !== expectedLanguage;
    })) {
        return { ok: false, reason: "mixed_language" };
    }

    const tokenLength = task.expectedAnswer.trim().split(/\s+/).length;
    const weakShape = distractors.some((choice) => Math.abs(choice.trim().split(/\s+/).length - tokenLength) > 2);
    if (weakShape) return { ok: false, reason: "shape_mismatch" };

    return { ok: true };
}

function hasClearPrompt(task: AiCoachTask): boolean {
    return task.prompt.trim().length >= 8 && /(übersetze|wähle|lücke)/i.test(task.prompt);
}

function hasSpecificHint(task: AiCoachTask): boolean {
    const hints = task.hintLevels ?? [];
    if (!hints.length) return true;
    return hints.some((hint) => {
        const clean = hint.trim();
        if (clean.length < 8) return false;
        if (GENERIC_HINT.some((rx) => rx.test(clean))) return false;
        return /[a-zäöüß]\.$/i.test(clean) || /\b(erst|beginnt|nominalklasse|plural|singular|fest|person|objekt|gruß|formel)\b/i.test(clean);
    });
}

function downgradeToTranslate(task: AiCoachTask, card: SourceCard): AiCoachTask {
    const source = (task.direction === "DE_TO_SW" ? card.german_text : card.swahili_text).trim().replace(/[\n\r]+/g, " ");
    const qualityHints = buildHintLevels(task.profile ?? {
        cardType: "vocab",
        linguisticUnit: "word",
        pos: "unknown",
        unitType: "single_word",
        linguisticType: "unknown",
        semanticUse: "unknown",
        contextRequired: false,
        morphologyRelevant: false,
        morphologicalInfo: {},
        exerciseSuitability: { recognition: true, recall: true, guidedRecall: false, contextUsage: false, contrastLearning: false, production: true },
        forbiddenExerciseTypes: [],
        preferredExerciseTypes: ["translate"],
        explanationStrategy: "meaning_first",
        qualityConfidence: 0.5,
        morphologicalFeatures: {},
        semanticComplexity: "simple",
        learningDifficulty: 2,
        exerciseCapabilities: { translation: true, recognition: true, cloze: false, production: true, contextUsage: false },
        exampleStrategy: "omit_if_low_confidence",
    }, task.expectedAnswer).filter((h) => !GENERIC_HINT.some((rx) => rx.test(h)));

    return {
        ...task,
        type: "translate",
        prompt: `Übersetze: ${source}`,
        choices: undefined,
        ui: { inputMode: "text" },
        hintLevels: qualityHints.slice(0, 3),
    };
}

export function validateFinalTask(task: AiCoachTask, params: { card: SourceCard; pool?: Array<SourceCard & { pos?: string | null; nounClass?: string | null }> }): AiCoachTask {
    if (!hasClearPrompt(task) || !hasSpecificHint(task)) return downgradeToTranslate(task, params.card);

    if (task.type === "mcq") {
        const choiceStatus = validateMcqChoices(task, task.direction);
        if (!choiceStatus.ok) {
            const poolCandidates: ChoiceCandidate[] = (params.pool ?? []).map((candidate) => ({
                text: task.direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text,
                pos: candidate.pos,
                nounClass: candidate.nounClass,
            }));
            const ranked = rankDistractorsByPedagogicalFit(task.expectedAnswer, poolCandidates, {
                direction: task.direction,
                targetPos: task.meta?.pos,
                targetNounClass: task.meta?.nounClass,
            });
            if (ranked.length >= 3) {
                return {
                    ...task,
                    choices: [task.expectedAnswer, ranked[0].text, ranked[1].text, ranked[2].text],
                };
            }
            return downgradeToTranslate(task, params.card);
        }
    }

    return task;
}
