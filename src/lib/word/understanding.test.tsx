import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WordUnderstandingContent } from "@/components/trainer/WordUnderstandingFeature";
import { briefLearningNote, hasWordUnderstanding, nounClassLabel, nounSentenceChange, wordUnderstandingPreview, type WordEnrichment } from "./understanding";

const noun: WordEnrichment = {
    pos: "noun", noun_class: "m/mi", singular: "mlango", plural: "milango", mnemonic: null,
    notes: "Im Plural wird m- zu mi-; die Kongruenz wechselt von u- zu i-.",
    examples: [
        { sw: "Mlango umefungwa.", de: "Die Tür ist geschlossen." },
        { sw: "Milango imefungwa.", de: "Die Türen sind geschlossen." },
    ],
};

describe("compact word understanding from existing enrichment", () => {
    it("shows mlango class, forms and concord as a short pattern with highlighted examples", () => {
        expect(hasWordUnderstanding(noun)).toBe(true);
        const html = renderToStaticMarkup(<WordUnderstandingContent enrichment={noun} swahili="mlango" german="Tür" />);
        for (const value of ["M-MI · Klasse 3/4", "mlango</strong>", "milango</strong>", "u- → i-", "<strong class=\"word-understanding-highlight\">Mlango</strong>", "<strong class=\"word-understanding-highlight\">Milango</strong>"]) expect(html).toContain(value);
        expect(html).not.toContain("WORTART");
        expect(html).not.toContain("Was verändert sich?");
        expect(html).not.toContain("Kongruenz");
        expect(nounClassLabel("unbekannt")).toBeNull();
    });
    it("teaches chumba with three changed sentence forms and no visible grammar jargon", () => {
        const chumba: WordEnrichment = { pos: "noun", noun_class: "ki/vi", singular: "chumba", plural: "vyumba", mnemonic: null,
            notes: "KI-VI: chumba → vyumba; Kongruenz: hiki/kikubwa → hivi/vikubwa.", examples: [
                { sw: "Chumba hiki ni kikubwa.", de: "Dieses Zimmer ist groß." },
                { sw: "Vyumba hivi ni vikubwa.", de: "Diese Zimmer sind groß.", changedForms: [
                    { from: "Chumba", to: "Vyumba" }, { from: "hiki", to: "hivi" }, { from: "kikubwa", to: "vikubwa" },
                ] },
            ] };
        const html = renderToStaticMarkup(<WordUnderstandingContent enrichment={chumba} swahili="chumba" german="Zimmer" />);
        for (const value of ["KI-VI · Klasse 7/8", "chumba</strong>", "vyumba</strong>", "So verändert sich der Satz", "↓ Plural",
            "<strong class=\"word-understanding-highlight\">Chumba</strong>", "<strong class=\"word-understanding-highlight\">hiki</strong>",
            "<strong class=\"word-understanding-highlight\">kikubwa</strong>", "<strong class=\"word-understanding-highlight\">Vyumba</strong>",
            "<strong class=\"word-understanding-highlight\">hivi</strong>", "<strong class=\"word-understanding-highlight\">vikubwa</strong>",
            "Auch „dieses/diese“ und „groß“ passen sich an die Nomenklasse an."]) expect(html).toContain(value);
        expect(html).not.toContain("Kongruenz");
        expect(nounSentenceChange({ ...chumba, examples: chumba.examples.map(({ sw, de }) => ({ sw, de })) })?.changed).toHaveLength(3);
    });
    it("shows the -ingi stem, four compact class forms and highlights the current nyingi form", () => {
        const adjective: WordEnrichment = {
            ...noun, pos: "adj", noun_class: null, singular: null, plural: null,
            notes: "„Nyingi“ bedeutet „viel/viele“ und steht meist bei zählbaren Nomen im Plural. Es ist die Pluralform von -ingi und verändert sich nach der Nomenklasse. Dieser lange Lexikontext soll verschwinden.",
            mnemonic: "nyingi klingt wie many mit ny-: viele.",
            examples: [{ sw: "Nina vitabu vingi.", de: "Ich habe viele Bücher." }],
        };
        const html = renderToStaticMarkup(<WordUnderstandingContent enrichment={adjective} swahili="nyingi" german="viel / viele" />);
        for (const value of ["kommt von <strong>-ingi</strong>", "watu", "wengi", "vitabu", "vingi", "mambo", "mengi", "nyumba", "N/N · Klasse 9/10", "class=\"is-current\"", "<strong class=\"word-understanding-highlight\">nyingi</strong>"]) expect(html).toContain(value);
        expect(html).not.toContain("Dieser lange Lexikontext");
        expect(html).not.toContain("klingt wie many");
        expect(html).toContain("Kuna nyumba");
    });
    it("decomposes Habari za asubuhi without noun singular/plural", () => {
        const html = renderToStaticMarkup(<WordUnderstandingContent enrichment={{ ...noun, pos: "phrase", notes: "Habari bedeutet Nachrichten; za verbindet mit asubuhi.", examples: [{ sw: "Habari za asubuhi!", de: "Guten Morgen!" }] }} swahili="Habari za asubuhi" german="Guten Morgen" />);
        expect(html).toContain("Nachricht / Befinden");
        expect(html).toContain("Verbindung zu Klasse 10");
        expect(html).toContain("Morgen");
        expect(html).not.toContain("mlango → milango");
    });
    it("shows verb stem and markers without noun class or plural", () => {
        const html = renderToStaticMarkup(<WordUnderstandingContent enrichment={{ ...noun, pos: "verb", noun_class: null, notes: "kwenda heißt gehen; -enda ist der Stamm, ni- das Subjekt und -na- Präsens.", examples: [{ sw: "Ninaenda.", de: "Ich gehe." }] }} swahili="kwenda" german="gehen" />);
        expect(html).toContain("Stamm <strong>-enda</strong>");
        expect(html).toContain("<strong>ni-</strong> ich");
        expect(html).toContain("<strong>-na-</strong> Präsens");
        expect(html).not.toContain("Klasse 3/4");
        expect(html).not.toContain("mlango");
    });
    it("keeps notes short and rejects generic fallback as sufficient learning content", () => {
        expect(briefLearningNote("Ein sehr kurzer Hinweis. Ein zweiter Hinweis. Ein dritter Hinweis.")).toBe("Ein sehr kurzer Hinweis. Ein zweiter Hinweis.");
        expect(hasWordUnderstanding({ ...noun, examples: [] })).toBe(false);
        expect(hasWordUnderstanding({ ...noun, notes: "" })).toBe(false);
        expect(hasWordUnderstanding({ ...noun, notes: "Achte auf die Nomenklasse m/wa: mlango im Singular, walango im Plural." })).toBe(false);
    });
    it("builds the mti preview from a complete sentence change instead of raw notes", () => {
        const mti: WordEnrichment = { ...noun, singular: "mti", plural: "miti", notes: "mti → miti; dazu huu → hii und mrefu → mirefu.", examples: [
            { sw: "Mti huu ni mrefu.", de: "Dieser Baum ist hoch." },
            { sw: "Miti hii ni mirefu.", de: "Diese Bäume sind hoch." },
        ] };
        const preview = wordUnderstandingPreview(mti, "mti", "Baum");
        expect(preview).toMatchObject({ kind: "noun", nounClass: "M-MI · Klasse 3/4", form: "mti → miti",
            transformation: { singular: "Mti huu ni mrefu.", plural: "Miti hii ni mirefu." } });
        expect(preview.hint).toContain("Im Plural");
        expect(JSON.stringify(preview)).not.toContain("dazu huu");
    });
    it("keeps adjective, verb and phrase previews focused on one useful pattern", () => {
        expect(wordUnderstandingPreview({ ...noun, pos: "adj" }, "nyingi", "viel / viele")).toMatchObject({ kind: "adjective", form: "-ingi = viel / viele", hint: "nyumba → nyingi" });
        expect(wordUnderstandingPreview({ ...noun, pos: "verb", examples: [{ sw: "Ninaenda.", de: "Ich gehe." }] }, "kwenda", "gehen")).toMatchObject({ kind: "verb", form: "kwenda", hint: "Stamm: -enda", example: { sw: "Ninaenda.", de: "Ich gehe." } });
        expect(wordUnderstandingPreview({ ...noun, pos: "phrase" }, "Habari za asubuhi", "Guten Morgen")).toMatchObject({ kind: "phrase", form: "Habari + za + asubuhi", hint: "Guten Morgen", transformation: null });
    });
});
