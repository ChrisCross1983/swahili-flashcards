"use client";

import TrainerClient from "../trainer/TrainerClient";

type Props = {
    ownerKey: string;
};

export default function SentenceTrainerClient({ ownerKey }: Props) {
    return <TrainerClient ownerKey={ownerKey} cardType="sentence" />;
}
