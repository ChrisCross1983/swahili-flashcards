import { buildDeterministicExplanation, shouldUseExplanation } from "./hintQuality";
import type { AiCoachResult, AiCoachTask, ErrorCategory, GrammarFocusType, GrammarTeachingPayload } from "./types";

const FIXED_EXPRESSION_CONTEXT = "Feste Wendung im sozialen Kontext; nicht Wort-für-Wort lernen.";

function clean(value?: string | null): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}

function inferGrammarFocus(task: AiCoachTask, errorCategory?: ErrorCategory): GrammarFocusType {
    if (errorCategory === "wrong_word_order") return "word_order";
    if (errorCategory === "semantic_confusion") return "semantic_contrast";
    if (errorCategory === "wrong_form" || errorCategory === "wrong_noun_class") return "morphology_pattern";

    const unitType = task.profile?.unitType;
    if (unitType === "greeting") return "greeting_usage";
    if (unitType === "phrase" || unitType === "formula" || unitType === "expression") return "fixed_phrase";

    if (task.profile?.pos === "verb") return "verb_infinitive";
    if (task.profile?.pos === "noun") {
        if (task.profile?.morphologicalInfo.nounClass) return "noun_class";
        if (task.profile?.morphologicalInfo.plural) return "singular_plural";
    }

    return "none";
}

function buildMorphologyString(task: AiCoachTask): string | undefined {
    const nounClass = clean(task.meta?.nounClass ?? task.profile?.morphologicalInfo.nounClass);
    const singular = clean(task.profile?.morphologicalInfo.singular);
    const plural = clean(task.meta?.plural ?? task.profile?.morphologicalInfo.plural);

    if (!nounClass && !singular && !plural) return undefined;
    if (!nounClass && singular && plural) return `Singular: ${singular} · Plural: ${plural}`;
    const parts = [
        nounClass ? `Nominalklasse: ${nounClass}` : undefined,
        singular ? `Singular: ${singular}` : undefined,
        plural ? `Plural: ${plural}` : undefined,
    ].filter(Boolean);
    return parts.join(" · ");
}

function buildPayload(task: AiCoachTask, learnerAnswer: string, errorCategory?: ErrorCategory): GrammarTeachingPayload {
    const nounClass = clean(task.meta?.nounClass ?? task.profile?.morphologicalInfo.nounClass);
    const singular = clean(task.profile?.morphologicalInfo.singular) ?? clean(task.expectedAnswer);
    const plural = clean(task.meta?.plural ?? task.profile?.morphologicalInfo.plural);
    const expected = clean(task.expectedAnswer) ?? "";

    const focus = inferGrammarFocus(task, errorCategory);

    const payload: GrammarTeachingPayload = {
        grammarFocusType: focus,
        nounClass,
        singularForm: singular,
        pluralForm: plural,
        verbBase: task.profile?.pos === "verb" ? expected : undefined,
    };

    if (focus === "noun_class" || focus === "singular_plural" || focus === "morphology_pattern") {
        payload.keyPattern = nounClass === "ki/vi"
            ? "ki- im Singular, vi- im Plural"
            : nounClass === "m/wa"
                ? "m- im Singular, wa- im Plural"
                : nounClass
                    ? `Achte auf das Klassenpaar ${nounClass}`
                    : undefined;
        payload.suggestedMicroDrill = singular && plural ? `Sprich laut: ${singular} → ${plural}.` : "Bilde Singular und Plural einmal laut.";
        payload.memoryHook = payload.keyPattern;
    }

    if (focus === "fixed_phrase" || focus === "greeting_usage") {
        payload.fixedExpressionNote = "Feste Formel: als ganze Einheit verwenden.";
        payload.usageContext = FIXED_EXPRESSION_CONTEXT;
        payload.keyPattern = "Bedeutung + Situation merken, nicht Einzelwörter übersetzen.";
        payload.suggestedMicroDrill = "Sag die Wendung in einem passenden Begrüßungs-Kontext laut.";
    }

    if (focus === "verb_infinitive") {
        payload.keyPattern = expected.startsWith("ku") ? "Viele Verben stehen im Wörterbuch mit ku- (Infinitiv)." : "Das ist ein Verb: Fokus auf Handlung und Grundform.";
        payload.suggestedMicroDrill = `Bilde einen Mini-Satz mit ${expected}.`;
    }

    if (focus === "semantic_contrast") {
        payload.contrastPair = { expected, learner: clean(learnerAnswer) };
        payload.keyPattern = "Achte auf die genaue Bedeutung, nicht nur ähnliche Wörter.";
        payload.suggestedMicroDrill = "Vergleiche das Zielwort mit einem ähnlichen Wortpaar.";
    }

    if (focus === "word_order") {
        payload.keyPattern = "Die richtigen Wörter sind wichtig, aber auch ihre Reihenfolge.";
        payload.suggestedMicroDrill = "Ordne die Wörter einmal in korrekter Reihenfolge.";
    }

    return payload;
}

export function buildMiniLesson(args: {
    task: AiCoachTask;
    result: AiCoachResult;
    learnerAnswer: string;
    aiExplanation?: string;
    aiMemoryHook?: string;
}): AiCoachResult["microLesson"] {
    const { task, result, learnerAnswer, aiExplanation, aiMemoryHook } = args;
    const plan = task.meta?.resultCardPlan;
    const grammar = buildPayload(task, learnerAnswer, result.errorCategory);

    const explanation = shouldUseExplanation(aiExplanation)
        ? aiExplanation?.trim()
        : shouldUseExplanation(result.explanation)
            ? result.explanation?.trim()
            : buildDeterministicExplanation(task, result.errorCategory);

    const contextNote = task.profile?.contextRequired
        ? "Nutze diese Antwort im passenden sozialen/sprachlichen Kontext."
        : undefined;

    return {
        explanation: plan?.showLearningNote ? (explanation ?? contextNote) : undefined,
        morphology: plan?.showMorphology ? buildMorphologyString(task) : undefined,
        example: plan?.showExample ? result.example ?? task.example : undefined,
        memoryHook: clean(aiMemoryHook) ?? grammar.memoryHook,
        nextStepCue: grammar.suggestedMicroDrill,
        grammar,
    };
}
