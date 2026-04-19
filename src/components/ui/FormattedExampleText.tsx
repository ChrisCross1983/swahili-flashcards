import { parseExampleMarkup } from "@/lib/examples/formatting";

type Props = {
    text: string;
    className?: string;
};

export default function FormattedExampleText({ text, className = "" }: Props) {
    const segments = parseExampleMarkup(text);

    return (
        <p className={`max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-muted ${className}`.trim()}>
            {segments.map((segment, index) => {
                if (segment.style === "bold") return <strong key={index}>{segment.text}</strong>;
                if (segment.style === "underline") return <u key={index}>{segment.text}</u>;
                if (segment.style === "mark") return <mark key={index} className="rounded-sm bg-yellow-200/70 px-0.5 text-primary">{segment.text}</mark>;
                return <span key={index}>{segment.text}</span>;
            })}
        </p>
    );
}
