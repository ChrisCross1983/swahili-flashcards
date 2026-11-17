import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const diagnostics = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20261114000000_diagnostics_security.sql", import.meta.url)), "utf8");
const hardening = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20261113000000_public_owner_rls_hardening.sql", import.meta.url)), "utf8");
const tables = ["app_diagnostic_events", "learning_run_health", "app_admin_members"] as const;

function definition(table: string) {
    const match = diagnostics.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
    expect(match, `${table} must be created`).not.toBeNull();
    return match![1];
}

describe("diagnostics schema security migration", () => {
    it("creates exactly the three intended tables with auth-user foreign keys", () => {
        expect([...diagnostics.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((match) => match[1])).toEqual(tables);
        for (const table of tables) {
            expect(definition(table)).toMatch(/user_id uuid (?:not null )?(?:primary key )?references auth\.users\(id\) on delete cascade/);
            expect(definition(table)).not.toMatch(/\bowner_key\b/);
        }
        expect(definition("app_admin_members")).toContain("granted_by uuid references auth.users(id) on delete set null");
    });

    it("bounds event fields without a free payload or content column", () => {
        const event = definition("app_diagnostic_events");
        expect(event).toContain("id uuid primary key");
        expect(event).toContain("source in ('client', 'server')");
        expect(event).toContain("severity in ('error', 'warning')");
        expect(event).toContain("http_status between 100 and 599");
        expect(event).toContain("fingerprint ~ '^[a-f0-9]{64}$'");
        expect(event).toContain("char_length(route) between 1 and 160");
        expect(event).not.toMatch(/\b(json|jsonb|payload|headers|token|cookie|prompt|card_text)\b/i);
    });

    it("constrains run progress, terminal states, sequence, and admin revocation", () => {
        const run = definition("learning_run_health");
        expect(run).toContain("sequence_number >= 0");
        expect(run).toContain("last_position <= initial_card_count");
        expect(run).toContain("correct_count + wrong_count <= last_position");
        expect(run).toContain("mode in ('LEITNER_TODAY', 'DRILL')");
        expect(run).toContain("learning_run_kind_matches_mode");
        expect(run).toContain("(ended_at is null) = (end_reason is null)");
        expect(definition("app_admin_members")).toContain("(enabled and revoked_at is null) or (not enabled and revoked_at is not null)");
    });

    it("enforces RLS with no client policies or grants and retains service-role CRUD", () => {
        for (const table of tables) {
            expect(diagnostics).toContain(`'${table}'`);
        }
        expect(diagnostics).toContain("alter table public.%I enable row level security");
        expect(diagnostics).toContain("alter table public.%I force row level security");
        expect(diagnostics).toContain("drop policy %I on public.%I");
        expect(diagnostics).toContain("revoke all privileges on table public.%I from public, anon, authenticated");
        expect(diagnostics).toContain("grant select, insert, update, delete on table public.%I to service_role");
        expect(diagnostics).not.toMatch(/create policy\s/i);
    });

    it.each(["diagnostics then hardening", "hardening then diagnostics"])("keeps all diagnostic tables outside hardening: %s", (order) => {
        expect(hardening).toContain("a.attname = 'owner_key'");
        expect(hardening).toContain("n.nspname = 'public'");
        const operations = order === "diagnostics then hardening" ? ["diagnostics", "hardening"] : ["hardening", "diagnostics"];
        const state = new Map(tables.map((table) => [table, { clientAccess: false, serviceAccess: false }]));
        for (const operation of operations) {
            for (const table of tables) {
                const row = state.get(table)!;
                if (operation === "diagnostics") {
                    row.clientAccess = false;
                    row.serviceAccess = true;
                } else if (/\bowner_key\b/.test(definition(table))) {
                    row.clientAccess = true;
                }
            }
        }
        for (const value of state.values()) expect(value).toEqual({ clientAccess: false, serviceAccess: true });
    });

    it("adds the requested access-pattern indexes and no cleanup job", () => {
        for (const fragment of [
            "(occurred_at desc)", "(user_id, occurred_at desc)", "(fingerprint, occurred_at desc)",
            "(run_id, occurred_at desc)", "(user_id, started_at desc)", "(last_heartbeat_at)",
        ]) expect(diagnostics).toContain(fragment);
        expect(diagnostics).not.toMatch(/cron\.schedule|expires_at|delete from/i);
    });
});
