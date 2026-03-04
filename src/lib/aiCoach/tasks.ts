import type { Direction } from "@/lib/trainer/types";
import type { AiCoachTask, AiTaskType } from "./types";
import { buildTask, type SourceCard } from "./tasks/generate";

export async function buildTaskFromCard(_ownerKey: string, card: SourceCard, taskType: AiTaskType, direction: Direction): Promise<AiCoachTask> {
    return buildTask({ card, direction, taskType });
}
