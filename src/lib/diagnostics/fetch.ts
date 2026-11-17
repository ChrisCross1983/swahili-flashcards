import { reportClientError } from "./client";

type FailureCode = "grade_failed" | "session_save_failed" | "today_load_failed" | "api_request_failed";

export async function diagnosedFetch(url: string, init: RequestInit, code: FailureCode, runId?: string | null): Promise<Response> {
    try {
        const response = await fetch(url, init);
        if (!response.ok) {
            void reportClientError({
                category: "api_failure", error_code: response.status >= 500 ? code : "api_request_failed",
                route: url, http_status: response.status, run_id: runId,
                severity: response.status >= 500 ? "error" : "warning",
                urgent: response.status >= 500,
            });
        }
        return response;
    } catch (error) {
        const name = error && typeof error === "object" && "name" in error ? error.name : null;
        if (name !== "AbortError") {
            void reportClientError({ category: "network", error_code: name === "TimeoutError" ? "timeout_error" : "network_error", route: url, run_id: runId, error, urgent: true });
        }
        throw error;
    }
}
