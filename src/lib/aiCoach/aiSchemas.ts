export const aiTaskDesignerSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        learningObjectType: { type: "string", enum: ["recognition", "active_recall", "guided_recall", "phrase_interpretation", "sentence_meaning", "morphology_focus", "contrast_repair", "contextual_usage", "mini_production"] },
        teachingObjective: { type: "string" },
        taskType: { type: "string", enum: ["translate", "mcq", "cloze"] },
        prompt: { type: "string" },
        expectedAnswer: { type: "string" },
        distractors: { type: "array", items: { type: "string" } },
        hint: { type: "string" },
        morphologyInfoNeeded: { type: "boolean" },
        exampleSentenceNeeded: { type: "boolean" },
        exampleSentence: {
            anyOf: [
                { type: "null" },
                {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        sw: { type: "string" },
                        de: { type: "string" },
                    },
                    required: ["sw", "de"],
                },
            ],
        },
        explanationPlan: { type: "string" },
        nextStepPlan: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: [
        "learningObjectType",
        "teachingObjective",
        "taskType",
        "prompt",
        "expectedAnswer",
        "distractors",
        "hint",
        "morphologyInfoNeeded",
        "exampleSentenceNeeded",
        "exampleSentence",
        "explanationPlan",
        "nextStepPlan",
        "confidence",
    ],
} as const;

export const aiTeachingResponseSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        verdict: { type: "string", enum: ["correct", "almost", "wrong", "skip", "nonsense"] },
        errorType: { type: "string", enum: ["typo", "wrong_form", "wrong_noun_class", "wrong_word_order", "semantic_confusion", "no_attempt", "unknown"] },
        shortExplanation: { type: "string" },
        showMorphology: { type: "boolean" },
        showExample: { type: "boolean" },
        exampleSentence: {
            anyOf: [
                { type: "null" },
                {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        sw: { type: "string" },
                        de: { type: "string" },
                    },
                    required: ["sw", "de"],
                },
            ],
        },
        nounClassInfo: { type: ["string", "null"] },
        memoryHook: { type: ["string", "null"] },
        nextLearningMoveRecommendation: { type: "string", enum: ["repeat_same_card", "lower_complexity", "switch_to_contrast", "advance"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["verdict", "errorType", "shortExplanation", "showMorphology", "showExample", "exampleSentence", "nounClassInfo", "memoryHook", "nextLearningMoveRecommendation", "confidence"],
} as const;
