export class ServerStageTimings<Stage extends string> {
  private readonly starts = new Map<Stage, { mono: number; at: string }>();
  private readonly completions = new Map<Stage, { mono: number; at: string }>();
  private readonly points = new Map<string, { mono: number; at: string }>();

  start(stage: Stage) {
    const point = { mono: performance.now(), at: new Date().toISOString() };
    this.starts.set(stage, point);
    return point.at;
  }

  complete(stage: Stage) {
    const point = { mono: performance.now(), at: new Date().toISOString() };
    this.completions.set(stage, point);
    return point.at;
  }

  startedAt(stage: Stage) {
    return this.starts.get(stage)?.at ?? null;
  }

  completedAt(stage: Stage) {
    return this.completions.get(stage)?.at ?? null;
  }

  markPoint(
    point: string,
    mono = performance.now(),
    at = new Date().toISOString(),
  ) {
    const value = { mono, at };
    this.points.set(point, value);
    return value.at;
  }

  pointAt(point: string) {
    return this.points.get(point)?.at ?? null;
  }

  durationBetween(startPoint: string, endPoint: string) {
    const start = this.points.get(startPoint)?.mono;
    const end = this.points.get(endPoint)?.mono;
    return start === undefined || end === undefined || end < start
      ? null
      : end - start;
  }

  duration(stage: Stage) {
    const started = this.starts.get(stage)?.mono;
    const completed = this.completions.get(stage)?.mono;
    return started === undefined || completed === undefined || completed < started
      ? null
      : completed - started;
  }
}

export function roundedServerTiming(value: number | null) {
  return value === null || !Number.isFinite(value) || value < 0
    ? null
    : Math.round(value);
}

export function otherPreOpenAiTiming(
  total: number | null,
  measuredStages: Array<number | null>,
) {
  if (total === null || !Number.isFinite(total) || total < 0) return null;
  const measured = measuredStages.reduce<number>(
    (sum, value) => sum + (value === null ? 0 : value),
    0,
  );
  return Math.max(0, total - measured);
}

export function unattributedPreOpenAiTiming(
  legacyOther: number | null,
  newlyMeasured: Array<number | null>,
) {
  return otherPreOpenAiTiming(legacyOther, newlyMeasured);
}
