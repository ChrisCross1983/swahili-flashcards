type Metric = { name: string; durationMs: number };

const enabled = () => process.env.PERFORMANCE_AUDIT === "1";

function safeMetricName(value: string): string {
    return /^[a-z][a-z0-9_]{0,39}$/i.test(value) ? value : "other";
}

export class ServerPerformanceAudit {
    private readonly startedAt = performance.now();
    private readonly metrics: Metric[] = [];

    constructor(private readonly scope: string) {}

    async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
        const startedAt = performance.now();
        try {
            return await work();
        } finally {
            this.metrics.push({ name: safeMetricName(name), durationMs: performance.now() - startedAt });
        }
    }

    mark(name: string, startedAt: number): void {
        this.metrics.push({ name: safeMetricName(name), durationMs: performance.now() - startedAt });
    }

    response(response: Response, metadata: Record<string, number> = {}): Response {
        this.mark("total", this.startedAt);
        const existing = response.headers.get("Server-Timing");
        const timing = this.metrics
            .map(({ name, durationMs }) => `${name};dur=${durationMs.toFixed(1)}`)
            .join(", ");
        response.headers.set("Server-Timing", [existing, timing].filter(Boolean).join(", "));
        if (enabled()) console.info("[performance-audit]", {
            scope: this.scope,
            metrics: Object.fromEntries(this.metrics.map(({ name, durationMs }) => [name, Math.round(durationMs)])),
            ...metadata,
        });
        return response;
    }

    log(metadata: Record<string, number> = {}): void {
        this.mark("total", this.startedAt);
        if (!enabled()) return;
        console.info("[performance-audit]", {
            scope: this.scope,
            metrics: Object.fromEntries(this.metrics.map(({ name, durationMs }) => [name, Math.round(durationMs)])),
            ...metadata,
        });
    }
}

export async function requireUserWithPerformance<T>(
    audit: ServerPerformanceAudit,
    requireUser: (instrumentation: {
        onClientPreparationStarted: () => void;
        onClientPreparationCompleted: () => void;
        onUserLookupStarted: () => void;
        onUserLookupCompleted: () => void;
    }) => Promise<T>,
): Promise<T> {
    let clientStartedAt = 0;
    let lookupStartedAt = 0;
    return requireUser({
        onClientPreparationStarted: () => { clientStartedAt = performance.now(); },
        onClientPreparationCompleted: () => audit.mark("auth_client", clientStartedAt),
        onUserLookupStarted: () => { lookupStartedAt = performance.now(); },
        onUserLookupCompleted: () => audit.mark("auth_user", lookupStartedAt),
    });
}
