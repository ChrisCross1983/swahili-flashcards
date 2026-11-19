import { afterEach, describe, expect, it } from "vitest";
import { signWordPreview, verifyWordPreview } from "./previewToken";

const savedSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enrichment = { pos: "noun" as const, noun_class: "m/mi", singular: "mlango", plural: "milango",
    examples: [{ sw: "Mlango uko wazi.", de: "Die Tür ist offen." }], mnemonic: null, notes: "Das Wort gehört zur Klasse m/mi." };

afterEach(() => { if (savedSecret === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedSecret; });

describe("word preview signature", () => {
    it("binds a generated preview to owner, card and a short lifetime", () => {
        process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-preview-signing-secret";
        const token = signWordPreview("user-a", "card-a", enrichment, 1_000);
        expect(verifyWordPreview(token, "user-a", "card-a", 1_001)).toEqual(enrichment);
        expect(verifyWordPreview(token, "user-b", "card-a", 1_001)).toBeNull();
        expect(verifyWordPreview(token, "user-a", "card-b", 1_001)).toBeNull();
        expect(verifyWordPreview(token, "user-a", "card-a", 1_000 + 21 * 60_000)).toBeNull();
        expect(verifyWordPreview(`${token}x`, "user-a", "card-a", 1_001)).toBeNull();
    });
});
