export type HealthUser = {
    id: string;
    email: string | null;
    display_name: string | null;
};

export const shortHealthId = (value: string | null | undefined) => value ? `${value.slice(0, 8)}…` : "—";

export function getAdminUserLabel(user: HealthUser | null | undefined): string {
    if (!user) return "Unbekannter User";
    if (user.display_name && user.email) return `${user.display_name} · ${user.email}`;
    if (user.email) return `${user.email} · ${shortHealthId(user.id)}`;
    return `User ${shortHealthId(user.id)}`;
}

export function healthUserFilenamePart(user: HealthUser | null | undefined): string | null {
    if (!user) return null;
    const source = user.display_name || user.email?.split("@")[0] || "";
    const slug = source.toLocaleLowerCase("de-DE").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    return slug || null;
}
