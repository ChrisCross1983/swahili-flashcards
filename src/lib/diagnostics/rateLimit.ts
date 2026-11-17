// Fast per-instance brake. The database count in the event route is the shared backstop.
const windows = new Map<string, { started: number; count: number }>();

export function allowDiagnosticsRequest(userId: string, kind: "events" | "runs" = "events", now = Date.now()): boolean {
    if (windows.size > 5_000) {
        for (const [key, value] of windows) if (now - value.started >= 60_000) windows.delete(key);
    }
    const key = `${kind}:${userId}`;
    const window = windows.get(key);
    if (!window || now - window.started >= 60_000) {
        windows.set(key, { started: now, count: 1 });
        return true;
    }
    if (window.count >= (kind === "events" ? 30 : 300)) return false;
    window.count++;
    return true;
}

export function resetDiagnosticsRateLimitForTests(): void {
    windows.clear();
}
