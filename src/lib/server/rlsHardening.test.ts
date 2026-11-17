import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20261113000000_public_owner_rls_hardening.sql", import.meta.url)),
  "utf8",
);

describe("public owner RLS migration guard", () => {
  it("covers every public owner_key table rather than a manually maintained subset", () => {
    expect(migration).toContain("a.attname = 'owner_key'");
    expect(migration).toContain("n.nspname = 'public'");
    expect(migration).toContain("alter table public.%I enable row level security");
  });

  it("fails closed on unexpected owner types and handles text and uuid explicitly", () => {
    expect(migration).toContain("'pg_catalog.text'::regtype");
    expect(migration).toContain("'pg_catalog.uuid'::regtype");
    expect(migration).toContain("raise exception 'Unsupported owner_key type");
  });

  it("removes broad privileges and old permissive policies before adding owner-only CRUD", () => {
    expect(migration).toContain("revoke all privileges on table public.%I from public, anon, authenticated");
    expect(migration).toContain("grant all privileges on table public.%I to service_role");
    expect(migration).toContain("drop policy %I on public.%I");
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(`for ${operation} to authenticated`);
    }
    expect(migration).toContain("owner_key = (select auth.uid()::text)");
    expect(migration).toContain("owner_key = (select auth.uid())");
  });

  it("requires child writes to reference the user's own card and group", () => {
    expect(migration).toContain("c.id = %I.card_id and c.owner_key = (select auth.uid()::text)");
    expect(migration).toContain("g.id = card_groups.group_id and g.owner_key = (select auth.uid()::text)");
  });
});
