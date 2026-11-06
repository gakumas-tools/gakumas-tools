import { Stages } from "gakumas-data";
import { FaLink } from "react-icons/fa6";

const latestSeason = Math.max(...Stages.getAll().map((s) => s.season));

export function isLatestSeason(stage) {
  return stage.season === latestSeason;
}

export function formatStageName(stage, t) {
  let stageName = "";
  if (stage.id == "custom") {
    stageName = t("custom");
  } else if (stage.type == "contest" || stage.type == "linkContest") {
    stageName = t("contestStageName", {
      season: stage.season,
      stage: stage.stage,
    });
  } else if (stage.type == "event") {
    stageName = t("eventStageName", {
      name: stage.name,
      stage: stage.stage,
      round: stage.round,
    });
  }
  if (stage.preview) {
    stageName += "*";
  }
  // Mark after the "*" so a link contest preview doesn't stringify the span
  if (stage.id != "custom" && stage.type == "linkContest") {
    return (
      <span>
        <FaLink />
        {stageName}
      </span>
    );
  }
  return stageName;
}

export function formatStageShortName(stage, t) {
  let stageName = "";
  if (stage.id == "custom") {
    stageName = t("custom");
  } else if (stage.type == "contest") {
    stageName = `${stage.season} - ${stage.stage}`;
  } else if (stage.type == "linkContest") {
    stageName = (
      <span>
        <FaLink /> {stage.season} - {stage.stage}
      </span>
    );
  } else if (stage.type == "event") {
    stageName = `${stage.stage} - ${stage.round}`;
  }
  return stageName;
}
