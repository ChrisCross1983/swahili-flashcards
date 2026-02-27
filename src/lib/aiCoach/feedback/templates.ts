import type { AnswerIntent } from "../eval/classify";
import type { AiCoachResult, AiCoachTask } from "../types";

type BuildFeedbackInput = {
    intent: AnswerIntent;
    answer: string;
    expected: string;
    hintLevel: number;
    exampleSentence?: string;
    scoreNormalized: number;
};

function typoAnalysis(answer: string, expected: string): string {
    if (answer.length === expected.length) {
        return `Fast da: nur ein kleiner Buchstabenfehler zwischen „${answer}“ und „${expected}“.`;
    }
    if (answer.length < expected.length) return "Dir fehlt mindestens ein Buchstabe.";
    return "Du hast einen zusätzlichen Buchstaben drin.";
}

function learningHint(expected: string, hintLevel: number): string {
    const word = expected.trim();
    if (!word) return "Achte auf Stamm + Endung.";
    if (hintLevel === 0) return "Sprich das Wort langsam in Silben und prüfe die Endung.";
    if (hintLevel === 1) return `Tipp: beginnt mit „${word.slice(0, 1)}“, Länge ${word.length}.`;
    if (hintLevel === 2) return `Tipp: Startfragment „${word.slice(0, 3)}…“.`;
    return "Wenn es klemmt, nutze Multiple-Choice als Stütze.";
}

export function buildFeedback(input: BuildFeedbackInput): AiCoachResult["feedback"] {
    const { intent, expected, answer, hintLevel, exampleSentence } = input;

    if (intent === "correct") {
        return {
            headline: "✅ Richtig",
            analysis: "Sauber gelöst.",
            hint: "Nächster Schritt: in einem Satz laut verwenden.",
            example: exampleSentence,
        };
    }

    if (intent === "typo") {
        return {
            headline: "⚠️ Fast richtig",
            analysis: typoAnalysis(answer.trim(), expected.trim()),
            hint: learningHint(expected, hintLevel),
            example: exampleSentence,
            solution: expected,
        };
    }

    if (intent === "almost") {
        return {
            headline: "⚠️ Fast richtig",
            analysis: "Die Richtung stimmt, aber Form/Endung passt noch nicht ganz.",
            hint: learningHint(expected, hintLevel),
            example: exampleSentence,
            solution: expected,
        };
    }

    if (intent === "no_attempt") {
        return {
            headline: "🤝 Alles gut — kurz lernen",
            analysis: "Kein Problem: wir bauen die Lösung Schritt für Schritt auf.",
            hint: learningHint(expected, Math.max(hintLevel, 1)),
            example: exampleSentence,
            solution: expected,
        };
    }

    return {
        headline: "❌ Noch nicht",
        analysis: intent === "nonsense" ? "Die Eingabe war keine verwertbare Antwort." : "Das war noch nicht die gesuchte Übersetzung.",
        hint: learningHint(expected, hintLevel),
        example: exampleSentence,
        solution: expected,
    };
}

export function actionHintsForIntent(intent: AnswerIntent, wrongAttemptsOnCard: number, hintLevel: number): AiCoachResult["actionHints"] {
    return {
        canRetry: intent !== "correct",
        shouldOfferMcq: intent === "no_attempt" || wrongAttemptsOnCard >= 2 || hintLevel >= 3,
        nextLabel: "Weiter",
    };
}

export function isCorrectIntent(intent: AnswerIntent): boolean {
    return intent === "correct";
}
