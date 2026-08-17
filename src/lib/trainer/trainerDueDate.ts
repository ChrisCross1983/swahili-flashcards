import { formatDays } from "@/lib/leitner";

const DAY_MS = 1000 * 60 * 60 * 24;

function parseLocalDate(value: string) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTrainerDueDate(currentDueDate?: string | null) {
    if (!currentDueDate) return null;
    const due = parseLocalDate(currentDueDate);
    if (!due) return currentDueDate;

    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(due);
}

export function formatTrainerDueStatus(currentDueDate?: string | null, todayDate = new Date()) {
    if (!currentDueDate) return null;

    const today = new Date(todayDate);
    today.setHours(0, 0, 0, 0);

    const due = parseLocalDate(currentDueDate);
    if (!due) return null;

    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / DAY_MS);

    if (diffDays < 0) {
        const pastDays = Math.abs(diffDays);
        return pastDays === 1 ? "seit 1 Tag fällig" : `seit ${pastDays} Tagen fällig`;
    }
    if (diffDays === 0) {
        return "heute fällig";
    }
    return `fällig ${formatDays(diffDays)}`;
}
