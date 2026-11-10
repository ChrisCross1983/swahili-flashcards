import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { mergeLegacyExamples, migrateExampleRecord } from "./migrateExamples";
import { parseNoteMarkup, wrapNoteSelection } from "./formatting";
import { NotePreview } from "@/components/trainer/NoteEditor";

describe("vocabulary example backfill", () => {
    it("handles only examples, only notes, both, and neither", () => {
        expect(mergeLegacyExamples("", "Ninaenda kazini leo.", "Ich gehe heute zur Arbeit.")).toBe("Beispiele:\n- Ninaenda kazini leo.\n- Ich gehe heute zur Arbeit.");
        expect(mergeLegacyExamples("Bestehende Notiz\n", null, null)).toBe("Bestehende Notiz\n");
        expect(mergeLegacyExamples("Bestehende Notiz\n", "Ninaenda", "Ich gehe")).toBe("Bestehende Notiz\n\n\nBeispiele:\n- Ninaenda\n- Ich gehe");
        expect(mergeLegacyExamples("", "", null)).toBe("");
    });
    it("retains order, line breaks, and special characters", () => {
        expect(mergeLegacyExamples("Ä & < >", "Kwanza\nPili", "Erst\nZweit")).toBe("Ä & < >\n\nBeispiele:\n- Kwanza\nPili\n- Erst\nZweit");
        expect(mergeLegacyExamples("", null, null, [{ sw: "Kwanza", de: "Erstens" }, { sw: "Pili", de: "Zweitens" }]))
            .toBe("Beispiele:\n- Kwanza\n- Erstens\n- Pili\n- Zweitens");
        expect(mergeLegacyExamples("", null, null, [], "Aus alter Notiz")).toBe("Beispiele:\n- Aus alter Notiz");
    });
    it("uses an explicit migration version and preserves legacy fields", () => {
        const first = migrateExampleRecord({ note: "Alt", version: 0, swahili: "Moja", german: "Eins" });
        const second = migrateExampleRecord(first);
        expect(second).toEqual(first);
        expect(second.note).toBe("Alt\n\nBeispiele:\n- Moja\n- Eins");
        const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261107000000_vocab_examples_to_notes.sql"), "utf8");
        expect(sql).toContain("examples_migration_version integer not null default 0");
        expect(sql).toContain("coalesce(n.examples_migration_version, 0) < 1");
        expect(sql).toContain("where public.card_notes.examples_migration_version < 1");
        expect(sql).not.toMatch(/drop column|update public\.cards/);
    });
});

describe("safe note markup", () => {
    it("wraps and unwraps selected text for B, I, U", () => {
        expect(wrapNoteSelection("abc", 0, 3, "**").value).toBe("**abc**");
        expect(wrapNoteSelection("abc", 0, 3, "*").value).toBe("*abc*");
        expect(wrapNoteSelection("abc", 0, 3, "__").value).toBe("__abc__");
        expect(wrapNoteSelection("**abc**", 0, 7, "**").value).toBe("abc");
    });
    it("renders plain and formatted notes as escaped React text", () => {
        expect(parseNoteMarkup("plain")).toEqual([{ text: "plain", style: "plain" }]);
        const html = renderToStaticMarkup(<NotePreview value={'**Fett** *kursiv* __unterstrichen__ <script>alert(1)</script>'} />);
        expect(html).toContain("<strong>Fett</strong>");
        expect(html).toContain("<em>kursiv</em>");
        expect(html).toContain("<u>unterstrichen</u>");
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });
});
