import { describe, expect, it } from "vitest";
import { validateAiTaskDesign, validateAiTeachingResponse } from "../aiValidators";
import { buildTask } from "../tasks/generate";

const task = buildTask({
    direction: "DE_TO_SW",
    taskType: "translate",
    objective: "recall",
    card: {
        id: "c1",
        german_text: "Buch",
        swahili_text: "kitabu",
        type: "vocab",
    },
    cardProfile: {
        unitType: "single_word",
        linguisticType: "noun",
        semanticUse: "object",
        morphologyRelevant: false,
        contextRequired: false,
        qualityConfidence: 0.9,

        cardType: "vocab",
        linguisticUnit: "word",
        pos: "noun",

        morphologicalInfo: {
            nounClass: undefined,
            singular: "kitabu",
            plural: "vitabu",
        },

        exerciseCapabilities: {
            translation: true,
            cloze: true,
            recognition: true,
            contextUsage: false,
            production: false,
        },

        exerciseSuitability: {
            recognition: true,
            recall: true,
            guidedRecall: true,
            contextUsage: false,
            contrastLearning: false,
            production: false,
        },

        forbiddenExerciseTypes: [],
        preferredExerciseTypes: ["translate", "mcq"],

        explanationStrategy: "meaning_first",
        exampleStrategy: "omit_if_low_confidence",

        morphologicalFeatures: {
            nounClass: undefined,
            plural: "vitabu",
        },

        semanticComplexity: "simple",
        learningDifficulty: 2,
    },
});

describe("ai JSON validators", () => {
    it("accepts a solid AI task design", () => {
        expect(validateAiTaskDesign({
            learningObjectType: "guided_recall",
            teachingObjective: "Geführter Abruf mit Kontext",
            taskType: "translate",
            prompt: "Übersetze im Kontext: Das Buch ist hier.",
            expectedAnswer: "kitabu",
            distractors: ["nyumba", "mti", "kiti"],
            hint: "Beginnt mit ki-",
            morphologyInfoNeeded: true,
            exampleSentenceNeeded: false,
            exampleSentence: null,
            explanationPlan: "Kurze Form-Erklärung",
            nextStepPlan: "Aktiver Abruf ohne Hint",
            confidence: 0.8,
        }, "DE_TO_SW")).toBe(true);
    });

    it("rejects mixed-language mcq distractors", () => {
        expect(validateAiTaskDesign({
            learningObjectType: "recognition",
            teachingObjective: "Bedeutung erkennen",
            taskType: "mcq",
            prompt: "Wähle die richtige Übersetzung",
            expectedAnswer: "kitabu",
            distractors: ["Haus", "Baum", "Freund"],
            hint: "",
            morphologyInfoNeeded: false,
            exampleSentenceNeeded: false,
            exampleSentence: null,
            explanationPlan: "",
            nextStepPlan: "",
            confidence: 0.9,
        }, "DE_TO_SW")).toBe(false);
    });

    it("rejects teaching response with irrelevant morphology", () => {
        expect(validateAiTeachingResponse({
            verdict: "wrong",
            errorType: "wrong_form",
            shortExplanation: "Die Endung passt nicht.",
            showMorphology: true,
            showExample: false,
            exampleSentence: null,
            nounClassInfo: "ki/vi",
            memoryHook: null,
            nextLearningMoveRecommendation: "repeat_same_card",
            confidence: 0.8,
        }, task)).toBe(false);
    });
});
