import type {
    AiCoachEvaluateInput,
    AiCoachEvaluateResponse,
    AiCoachNextInput,
    AiCoachNextResponse,
    AiCoachStartInput,
    AiCoachStartResponse,
} from "./types";

async function postJson<T>(url: string, payload: unknown): Promise<T> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error((json as { error?: string }).error ?? "AI request failed");
    }

    return json as T;
}

export function startAiCoachSession(input: AiCoachStartInput) {
    return postJson<AiCoachStartResponse>("/api/aiCoach/start", input);
}

export function evaluateAiCoachAnswer(input: AiCoachEvaluateInput) {
    return postJson<AiCoachEvaluateResponse>("/api/aiCoach/evaluate", input);
}

export function fetchNextAiCoachTask(input: AiCoachNextInput) {
    return postJson<AiCoachNextResponse>("/api/aiCoach/next", input);
}
