// Stored values are palette keys. Legacy or missing color values render as neutral.
export const GROUP_COLOR_PALETTE = [
    { key: "neutral", label: "Neutral", hex: "#77736d" },
    { key: "amber", label: "Amber", hex: "#a87428" },
    { key: "orange", label: "Orange", hex: "#b56b3c" },
    { key: "terra", label: "Terrakotta", hex: "#a75c49" },
    { key: "rose", label: "Rosé", hex: "#ad6973" },
    { key: "sage", label: "Salbei", hex: "#72846b" },
    { key: "green", label: "Grün", hex: "#4f8063" },
    { key: "teal", label: "Türkis", hex: "#4b817e" },
    { key: "blue", label: "Blau", hex: "#5a7e9d" },
    { key: "indigo", label: "Indigo", hex: "#687399" },
    { key: "violet", label: "Violett", hex: "#866e96" },
] as const;

export type GroupColorKey = (typeof GROUP_COLOR_PALETTE)[number]["key"];

export function isGroupColorKey(value: unknown): value is GroupColorKey {
    return typeof value === "string" && GROUP_COLOR_PALETTE.some((entry) => entry.key === value);
}

export function resolveGroupColor(value: unknown): (typeof GROUP_COLOR_PALETTE)[number] {
    return GROUP_COLOR_PALETTE.find((entry) => entry.key === value) ?? GROUP_COLOR_PALETTE[0];
}
