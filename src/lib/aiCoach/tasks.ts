import type { Direction } from "@/lib/trainer/types";
import type { AiCoachTask, AiTaskType } from "./types";
import { generateTask, type SourceCard } from "./tasks/generate";

export async function buildTaskFromCard(ownerKey: string, card: SourceCard, taskType: AiTaskType, direction: Direction): Promise<AiCoachTask> {
    return generateTask({ ownerKey, card, direction, taskType });
}
