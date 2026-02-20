import CardText from "@/components/ui/CardText";

type Props = {
    reveal: boolean;
    prompt: string;
    answer: string;
    imagePath: string | null;
    imageBaseUrl: string;
};

export default function TrainerCard({ reveal, prompt, answer, imagePath, imageBaseUrl }: Props) {
    return (
        <div className="rounded-3xl border border-soft bg-surface p-6 shadow-soft">
            <div className="text-sm text-muted">Übersetze:</div>
            <div className="mt-2 text-3xl font-semibold text-primary">
                <CardText>{prompt}</CardText>
            </div>

            {imagePath ? (
                <div className="mt-4">
                    <img src={`${imageBaseUrl}/${imagePath}`} alt="Kartenbild" className="h-40 w-full rounded-2xl object-cover" />
                </div>
            ) : null}

            {reveal ? (
                <div className="mt-8 rounded-2xl bg-surface-elevated p-4">
                    <div className="text-sm text-muted">Antwort</div>
                    <div className="mt-1 text-xl font-semibold text-primary">
                        <CardText>{answer}</CardText>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
