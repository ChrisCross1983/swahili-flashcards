import type { Direction } from "@/lib/trainer/types";
import type { AiCoachTask, AiTaskType } from "./types";
import { generateTask, type SourceCard } from "./tasks/generate";

export function buildTaskFromCard(card: SourceCard, taskType: AiTaskType, direction: Direction): AiCoachTask {
    return generateTask({ card, direction, taskType });
}
