import Link from "next/link";
import AppRouteState from "@/components/AppRouteState";

export default function NotFound() {
  return (
    <AppRouteState
      eyebrow="404"
      title="Diese Seite gibt es nicht"
      description="Die Adresse passt zu keiner Ansicht im Vokabeltrainer. Von der Startseite kommst du wieder in die bekannten Bereiche."
    >
      <Link className="btn btn-primary min-h-12" href="/">
        Zur Startseite
      </Link>
    </AppRouteState>
  );
}
