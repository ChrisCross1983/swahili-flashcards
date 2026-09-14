import type { TranslatorBuildMetadata } from "@/lib/translator/diagnosticMetadata";

export function formatClassicTranslatorBuildMarker(
  reportRevision: string,
  buildMetadata: Pick<TranslatorBuildMetadata, "frontendRuntimeEnvironment" | "gitCommitSha">,
) {
  const environment = buildMetadata.frontendRuntimeEnvironment === "production"
    ? "PROD"
    : "LOCAL";
  const shortSha = environment === "PROD" ? buildMetadata.gitCommitSha?.slice(0, 7) : null;
  return [`Classic ${reportRevision}`, environment, ...(shortSha ? [shortSha] : [])].join(" · ");
}

export default function TranslatorBuildMarker({
  reportRevision,
  buildMetadata,
}: {
  reportRevision: string;
  buildMetadata: Pick<TranslatorBuildMetadata, "frontendRuntimeEnvironment" | "gitCommitSha">;
}) {
  return (
    <p className="mt-6 pb-2 text-center text-[11px] text-muted" data-testid="translator-build-marker">
      {formatClassicTranslatorBuildMarker(reportRevision, buildMetadata)}
    </p>
  );
}
