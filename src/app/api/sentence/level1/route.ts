import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";

type Template = {
    prompt_de: string;
    slotType: "NOUN" | "ADJ" | "VERB";
};

type ClassifiedCard = {
    id: string;
    german_text: string;
    swahili_text: string;
    tag: Template["slotType"];
};

const templates: Template[] = [
    { prompt_de: "Ich mag ___.", slotType: "NOUN" },
    { prompt_de: "Das ist ___.", slotType: "ADJ" },
    { prompt_de: "Ich ___.", slotType: "VERB" },
];

const commonVerbs = [
    "gehen",
    "kommen",
    "sehen",
    "machen",
    "haben",
    "sein",
    "essen",
    "trinken",
    "nehmen",
    "lernen",
    "spielen",
    "arbeiten",
    "schlafen",
    "lesen",
    "schreiben",
    "laufen",
    "singen",
    "tanzen",
    "denken",
    "sprechen",
    "geben",
    "kaufen",
    "fahren",
];

const adjectiveList = [
    "leicht",
    "schwer",
    "dick",
    "dünn",
    "schnell",
    "langsam",
    "heiß",
    "kalt",
    "laut",
    "leise",
];

const adjectiveEndings = ["ig", "lich", "isch", "bar"];

function stripArticle(text: string) {
    const lower = text.trim().toLowerCase();
    const articleRegex = /^(der|die|das|ein|eine|einen|einem|eines|den|dem|des)\s+/i;
    return lower.replace(articleRegex, "").trim();
}

function classifyCard(card: { german_text: string; swahili_text: string }): ClassifiedCard["tag"] {
    const german = stripArticle(card.german_text);
    const swahili = (card.swahili_text ?? "").trim().toLowerCase();

    if (german.startsWith("zu ") || commonVerbs.includes(german) || swahili.startsWith("ku")) {
        return "VERB";
    }

    if (
        adjectiveEndings.some((ending) => german.endsWith(ending)) ||
        adjectiveList.includes(german)
    ) {
        return "ADJ";
    }

    return "NOUN";
}

function sample<T>(items: T[]): T | null {
    if (!items.length) return null;
    const idx = Math.floor(Math.random() * items.length);
    return items[idx];
}

function shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const ownerKey = user.id;

    const { data, error } = await supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text")
        .eq("owner_key", ownerKey);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cards = (data ?? []).map((card) => ({
        ...card,
        tag: classifyCard(card),
    })) as ClassifiedCard[];

    if (!cards.length) {
        return NextResponse.json({ error: "Keine Karten gefunden." }, { status: 404 });
    }

    const template = sample(templates) ?? templates[0];
    const matching = cards.filter((c) => c.tag === template.slotType);
    const correctCard = sample(matching) ?? sample(cards);

    if (!correctCard) {
        return NextResponse.json({ error: "Keine Karten für Übung verfügbar." }, { status: 404 });
    }

    const distractPool = cards.filter(
        (c) => c.id !== correctCard.id && c.tag !== template.slotType,
    );
    const sameTypePool = cards.filter((c) => c.id !== correctCard.id && c.tag === template.slotType);

    const distractors: ClassifiedCard[] = [];

    shuffle(distractPool).slice(0, 3).forEach((c) => distractors.push(c));

    if (distractors.length < 3) {
        shuffle(sameTypePool)
            .slice(0, 3 - distractors.length)
            .forEach((c) => distractors.push(c));
    }

    const options = shuffle([correctCard, ...distractors].slice(0, 4)).map((card) => ({
        id: card.id,
        de: card.german_text,
        sw: card.swahili_text,
        tag: card.tag,
    }));

    return NextResponse.json({
        prompt_de: template.prompt_de,
        prompt_sw: null,
        slotType: template.slotType,
        options,
        answerId: correctCard.id,
    });
}
