import { memo } from "react";
import { useTranslations } from "next-intl";
import { IdolRoad } from "gakumas-data";
import Alert from "@/components/Alert";

// An Idol Road stage runs without its 応援効果 (or its idol's criteria and
// turns) when the data has no row for the P-idol, which puts scores well
// below the game's. Says so; nothing for other stages or full data.
function IdolRoadDataNotice({ stage, pIdolId, className }) {
  const t = useTranslations("Simulator");
  const missing = IdolRoad.getMissingData(stage, pIdolId);
  if (!missing) return null;
  return (
    <Alert variant="warning" className={className}>
      {t("idolRoadMissingData", {
        missing: missing.supportEffects ? "supportEffects" : "idolRow",
        effect: missing.recommendedEffect,
      })}
    </Alert>
  );
}

export default memo(IdolRoadDataNotice);
