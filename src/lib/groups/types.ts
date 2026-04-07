export type GroupTypeScope = "vocab" | "sentence";

export type Group = {
    id: string;
    name: string;
    type_scope?: GroupTypeScope | null;
    description?: string | null;
    color?: string | null;
    sort_order?: number | null;
    created_at?: string;
    updated_at?: string;
};
