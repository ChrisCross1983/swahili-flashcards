"use client";

import TrainerClient from "../trainer/TrainerClient";

type Props = {
    ownerKey: string;
    userEmail: string | null;
};

export default function SentenceTrainerClient({ ownerKey, userEmail }: Props) {
    return <TrainerClient ownerKey={ownerKey} userEmail={userEmail} cardType="sentence" />;
}
